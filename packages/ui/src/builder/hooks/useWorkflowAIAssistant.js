import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DEFAULT_CLARIFICATION_MODE } from '../../../../shared/agentContract.js';
import { getClarificationModePreference, setClarificationModePreference } from '../../utils/storage.js';
import { clearWorkflowAIChat, decideWorkflowAIProposal, getWorkflowAIChat, resetWorkflowAIContext } from '../../api/backend.js';
import { submitWorkflowAITurnStream } from '../../api/aiStream.js';
import { useAIStream } from '../../context/AIStreamContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';

const LIMIT = 50;
const defaultMessage = {
    id: 'workflow_ai_init',
    sender: 'bot',
    kind: 'text',
    text: "Hi! I'm the AI assistant for this workflow. I can inspect and propose changes to this workflow only."
};

const draftKeyFor = workflowId => `promptly.workflow-ai.draft.${workflowId}`;

const readDraft = workflowId => {
    if (!workflowId || typeof window === 'undefined') return '';
    try { return sessionStorage.getItem(draftKeyFor(workflowId)) || ''; } catch { return ''; }
};

const writeDraft = (workflowId, value) => {
    if (!workflowId || typeof window === 'undefined') return;
    try {
        if (value) sessionStorage.setItem(draftKeyFor(workflowId), value);
        else sessionStorage.removeItem(draftKeyFor(workflowId));
    } catch { /* Draft persistence is best effort. */ }
};

/**
 * Normalize a send input into the canonical `{ command, text }` shape
 * expected by submitWorkflowAITurnStream.
 *
 * Accepts:
 *  - A string              → { command: null, text: string }
 *  - { type, ... } object  → forwarded as { command: object, text: '' }
 *  - { command, text }     → passed through as-is
 */
const normalizeInput = value => {
    if (typeof value === 'string') return { command: null, text: value };
    if (value && typeof value === 'object') {
        if ('type' in value) return { command: value, text: '' };
        return { command: value.command || null, text: value.text || '' };
    }
    return { command: null, text: '' };
};

/** Derive a display text for the optimistic user message bubble. */
const displayTextFor = ({ command, text }) => {
    if (command?.type === 'decide_for_me') return 'Use sensible defaults.';
    return text || '';
};

export const useWorkflowAIAssistant = (workflow, { onBeforeSend, initialPrompt = '' } = {}) => {
    const workflowId = workflow?.id || null;
    const queryClient = useQueryClient();
    const toast = useToast();
    const queryKey = ['workflowAI', workflowId];
    const [input, setInputState] = useState(() => readDraft(workflowId) || initialPrompt || '');
    const [isTyping, setIsTyping] = useState(false);
    const [progressLabel, setProgressLabel] = useState('Reading this workflow');
    const [clarificationMode, setClarificationMode] = useState(() => getClarificationModePreference() || DEFAULT_CLARIFICATION_MODE);
    const [acceptingProposalId, setAcceptingProposalId] = useState(null);
    const [rejectingProposalId, setRejectingProposalId] = useState(null);
    // Cursor for loading older messages (null = no earlier messages fetched yet).
    const [beforeCursor, setBeforeCursor] = useState(null);
    const [olderMessages, setOlderMessages] = useState([]);
    const [isLoadingMore, setIsLoadingMore] = useState(false);

    const {
        isTyping: sharedIsTyping,
        progressLabel: sharedProgressLabel,
        setStreamState,
        clearStreamState
    } = useAIStream(workflowId);

    const historyQuery = useQuery({
        queryKey,
        queryFn: () => getWorkflowAIChat(workflowId, LIMIT),
        enabled: Boolean(workflowId),
        staleTime: 1000 * 60 * 5,
        retry: false
    });

    useEffect(() => {
        if (!workflowId || historyQuery.data?.state?.phase !== 'processing') return undefined;
        const interval = setInterval(() => historyQuery.refetch(), 2000);
        return () => clearInterval(interval);
    }, [workflowId, historyQuery.data?.state?.phase, historyQuery.refetch]);

    // The provider survives Configure/History unmounts. Reconcile its visual
    // state with the server-owned lifecycle when the assistant is remounted.
    useEffect(() => {
        const processing = historyQuery.data?.state?.phase === 'processing';
        const persistedProgress = historyQuery.data?.state?.progress?.message || 'Working on your workflow…';
        if (processing && (!sharedIsTyping || sharedProgressLabel !== persistedProgress)) {
            setStreamState({ isTyping: true, progressLabel: persistedProgress });
        } else if (!processing && sharedIsTyping && !isTyping) {
            clearStreamState();
        }
    }, [historyQuery.data?.state?.phase, historyQuery.data?.state?.progress?.message, isTyping, sharedIsTyping, sharedProgressLabel, setStreamState, clearStreamState]);

    useEffect(() => {
        setInputState(readDraft(workflowId) || initialPrompt || '');
        // Reset pagination when switching workflows.
        setBeforeCursor(null);
        setOlderMessages([]);
    }, [workflowId, initialPrompt]);

    const setInput = useCallback(value => {
        setInputState(value);
        writeDraft(workflowId, value);
    }, [workflowId]);

    // Combine older messages (loaded via pagination) with the live query result.
    const messages = useMemo(() => {
        const recent = historyQuery.data?.messages || [];
        if (!historyQuery.data) return [defaultMessage];
        const combined = [...olderMessages, ...recent];
        return combined.length ? combined : [defaultMessage];
    }, [historyQuery.data, olderMessages]);

    const sendMutation = useMutation({
        mutationFn: async ({ input: sendInput, requestId }) => {
            const { command, text } = normalizeInput(sendInput);
            return submitWorkflowAITurnStream(
                workflowId,
                { command, text },
                clarificationMode,
                progress => {
                    const label = progress.message || 'Thinking…';
                    setProgressLabel(label);
                    setStreamState({ isTyping: true, progressLabel: label, requestId });
                },
                { expectedStateVersion: historyQuery.data?.state?.version, requestId }
            );
        },
        onMutate: async ({ input: sendInput, requestId }) => {
            const { command, text } = normalizeInput(sendInput);
            const optimisticText = displayTextFor({ command, text });
            setIsTyping(true);
            setProgressLabel('Preparing workflow changes…');
            setStreamState({ isTyping: true, progressLabel: 'Preparing workflow changes…', requestId });
            setInput('');
            await queryClient.cancelQueries({ queryKey });
            const previous = queryClient.getQueryData(queryKey);
            const optimistic = { id: `optimistic_${Date.now()}`, sender: 'user', kind: 'text', text: optimisticText, isOptimistic: true };
            queryClient.setQueryData(queryKey, old => ({
                ...(old || { state: null, nextBefore: null }),
                messages: [...(old?.messages || []), optimistic]
            }));
            return { previous, optimisticId: optimistic.id };
        },
        onSuccess: (result, variables, context) => {
            setIsTyping(false);
            clearStreamState();
            queryClient.setQueryData(queryKey, old => {
                const existing = old?.messages || [];
                const filtered = existing.filter(message => message.id !== context?.optimisticId && message.id !== result.userMsg?.id && message.id !== result.botMsg?.id);
                return { ...(old || {}), messages: [...filtered, result.userMsg, result.botMsg].filter(Boolean), state: result.state };
            });
        },
        onError: (_error, _variables, context) => {
            setIsTyping(false);
            clearStreamState();
            if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
            queryClient.invalidateQueries({ queryKey });
        }
    });

    const decideMutation = useMutation({
        mutationFn: ({ messageId, action }) => decideWorkflowAIProposal(
            workflowId,
            messageId,
            action,
            historyQuery.data?.state?.version
        ),
        onSuccess: result => {
            queryClient.setQueryData(queryKey, old => old ? {
                ...old,
                state: result.state,
                messages: old.messages.map(message => message.id === result.message?.id ? result.message : message)
            } : old);
            if (result.workflow) {
                queryClient.setQueryData(['workflows', workflowId], result.workflow);
                queryClient.setQueryData(['workflows'], old => old ? old.map(item => item.id === workflowId ? result.workflow : item) : old);
            }
            queryClient.invalidateQueries({ queryKey: ['workflows', workflowId] });
        }
    });

    const clearChatMutation = useMutation({
        mutationFn: () => clearWorkflowAIChat(workflowId),
        onSuccess: result => {
            clearStreamState();
            setBeforeCursor(null);
            setOlderMessages([]);
            queryClient.setQueryData(queryKey, { messages: [], nextBefore: null, state: result.state });
            toast.success('Workflow AI chat cleared.');
        },
        onError: error => {
            toast.error(error.message || 'The workflow AI chat could not be cleared.');
        }
    });

    const resetContextMutation = useMutation({
        mutationFn: () => resetWorkflowAIContext(workflowId),
        onSuccess: result => {
            queryClient.setQueryData(queryKey, old => old ? { ...old, state: result.state } : old);
            toast.success('Remembered workflow context reset.');
        },
        onError: error => toast.error(error.message || 'The remembered workflow context could not be reset.')
    });

    /**
     * handleSend accepts:
     *  - A plain string  → regular text message
     *  - A command object with `type` field → structured command (e.g. decide_for_me)
     */
    const handleSend = useCallback(async value => {
        const normalized = normalizeInput(value);
        // Require either a non-empty text or a structured command.
        const hasContent = normalized.command || normalized.text.trim();
        if (!hasContent || isTyping || !workflowId) return;
        try {
            await onBeforeSend?.();
        } catch {
            return;
        }
        const requestId = globalThis.crypto?.randomUUID?.() || `workflow_turn_${Date.now()}`;
        sendMutation.mutate({ input: normalized, requestId });
    }, [isTyping, onBeforeSend, sendMutation, workflowId]);

    const handleApply = useCallback(async message => {
        if (message.kind !== 'workflow_proposal' && message.kind !== 'workflow_diff') return;
        setAcceptingProposalId(message.id);
        try {
            await decideMutation.mutateAsync({ messageId: message.id, action: 'accept' });
            toast.success('Workflow updated successfully!');
        } catch (error) {
            toast.error(error.message || 'Failed to apply changes.');
        }
        finally { setAcceptingProposalId(null); }
    }, [decideMutation, toast]);

    const handleIgnore = useCallback(async message => {
        if (message.kind !== 'workflow_proposal' && message.kind !== 'workflow_diff') return;
        setRejectingProposalId(message.id);
        try { await decideMutation.mutateAsync({ messageId: message.id, action: 'reject' }); }
        finally { setRejectingProposalId(null); }
    }, [decideMutation]);

    /**
     * handleOption handles both suggestion chip strings and structured
     * clarification responses. When the clarification card emits a
     * `decide_for_me` command, it should be forwarded as a command object.
     */
    const handleOption = useCallback(option => {
        if (option && typeof option === 'object' && option.type) {
            // Structured command (e.g. { type: 'decide_for_me', clarificationId })
            handleSend(option);
        } else {
            const value = typeof option === 'string' ? option : option?.label || option?.name || option?.title || '';
            if (value) handleSend(value);
        }
    }, [handleSend]);

    const clearChat = useCallback(() => {
        if (!workflowId || clearChatMutation.isPending) return Promise.resolve();
        return clearChatMutation.mutateAsync();
    }, [clearChatMutation, workflowId]);

    const updateClarificationMode = useCallback(mode => {
        setClarificationMode(mode);
        setClarificationModePreference(mode);
    }, []);

    /**
     * Load the next page of older messages using cursor-based pagination.
     * Results are prepended to the olderMessages list.
     */
    const loadMoreHistory = useCallback(async () => {
        if (!workflowId || isLoadingMore) return;
        const cursor = beforeCursor ?? historyQuery.data?.nextBefore;
        if (!cursor) return;
        setIsLoadingMore(true);
        try {
            const result = await getWorkflowAIChat(workflowId, LIMIT, cursor);
            const fetched = result?.messages || [];
            setOlderMessages(prev => [...fetched, ...prev]);
            setBeforeCursor(result?.nextBefore || null);
        } catch {
            toast.error('Could not load older messages.');
        } finally {
            setIsLoadingMore(false);
        }
    }, [workflowId, isLoadingMore, beforeCursor, historyQuery.data?.nextBefore, toast]);

    const hasMore = Boolean(
        beforeCursor !== null
            ? beforeCursor
            : historyQuery.data?.nextBefore
    );

    return {
        messages,
        input,
        setInput,
        isTyping: isTyping || sharedIsTyping || historyQuery.data?.state?.phase === 'processing',
        progressLabel: sharedIsTyping
            ? sharedProgressLabel
            : (historyQuery.data?.state?.phase === 'processing'
                ? historyQuery.data.state.progress?.message || 'Working on your workflow…'
                : progressLabel),
        clarificationMode,
        updateClarificationMode,
        handleSend,
        handleApply,
        handleIgnore,
        handleOption,
        acceptingProposalId,
        rejectingProposalId,
        isLoadingHistory: historyQuery.isLoading,
        hasMore,
        loadMoreHistory,
        isLoadingMore,
        error: historyQuery.error,
        clearChat,
        isClearingChat: clearChatMutation.isPending,
        resetContext: () => workflowId ? resetContextMutation.mutateAsync() : Promise.resolve(),
        isResettingContext: resetContextMutation.isPending
    };
};
