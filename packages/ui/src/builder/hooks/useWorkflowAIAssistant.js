import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DEFAULT_CLARIFICATION_MODE } from '../../../../shared/agentContract.js';
import { getClarificationModePreference, setClarificationModePreference } from '../../utils/storage.js';
import { clearWorkflowAIChat, decideWorkflowAIProposal, getWorkflowAIChat } from '../../api/backend.js';
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
        if (processing && !sharedIsTyping) {
            setStreamState({ isTyping: true, progressLabel: sharedProgressLabel || 'Thinking…' });
        } else if (!processing && sharedIsTyping) {
            clearStreamState();
        }
    }, [historyQuery.data?.state?.phase, sharedIsTyping, sharedProgressLabel, setStreamState, clearStreamState]);

    useEffect(() => {
        setInputState(readDraft(workflowId) || initialPrompt || '');
    }, [workflowId, initialPrompt]);

    const setInput = useCallback(value => {
        setInputState(value);
        writeDraft(workflowId, value);
    }, [workflowId]);

    const messages = useMemo(() => {
        if (!historyQuery.data) return [defaultMessage];
        return historyQuery.data.messages?.length ? historyQuery.data.messages : [defaultMessage];
    }, [historyQuery.data]);

    const sendMutation = useMutation({
        mutationFn: async ({ text, requestId }) => submitWorkflowAITurnStream(
            workflowId,
            text,
            clarificationMode,
            progress => {
                const label = progress.message || 'Thinking…';
                setProgressLabel(label);
                setStreamState({ isTyping: true, progressLabel: label, requestId });
            },
            { expectedStateVersion: historyQuery.data?.state?.version, requestId }
        ),
        onMutate: async ({ text, requestId }) => {
            setIsTyping(true);
            setProgressLabel('Reading this workflow');
            setStreamState({ isTyping: true, progressLabel: 'Reading this workflow', requestId });
            setInput('');
            await queryClient.cancelQueries({ queryKey });
            const previous = queryClient.getQueryData(queryKey);
            const optimistic = { id: `optimistic_${Date.now()}`, sender: 'user', kind: 'text', text, isOptimistic: true };
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
            queryClient.setQueryData(queryKey, { messages: [], nextBefore: null, state: result.state });
            toast.success('Workflow AI chat cleared.');
        },
        onError: error => {
            toast.error(error.message || 'The workflow AI chat could not be cleared.');
        }
    });

    const handleSend = useCallback(async value => {
        const text = typeof value === 'string' ? value.trim() : '';
        if (!text || isTyping || !workflowId) return;
        try {
            await onBeforeSend?.();
        } catch {
            return;
        }
        const requestId = globalThis.crypto?.randomUUID?.() || `workflow_turn_${Date.now()}`;
        sendMutation.mutate({ text, requestId });
    }, [isTyping, onBeforeSend, sendMutation, workflowId]);

    const handleApply = useCallback(async message => {
        if (message.kind !== 'workflow_proposal') return;
        setAcceptingProposalId(message.id);
        try { await decideMutation.mutateAsync({ messageId: message.id, action: 'accept' }); }
        finally { setAcceptingProposalId(null); }
    }, [decideMutation]);

    const handleIgnore = useCallback(async message => {
        if (message.kind !== 'workflow_proposal') return;
        setRejectingProposalId(message.id);
        try { await decideMutation.mutateAsync({ messageId: message.id, action: 'reject' }); }
        finally { setRejectingProposalId(null); }
    }, [decideMutation]);

    const handleOption = useCallback(option => {
        const value = typeof option === 'string' ? option : option?.label || option?.name || option?.title || '';
        if (value) handleSend(value);
    }, [handleSend]);

    const clearChat = useCallback(() => {
        if (!workflowId || clearChatMutation.isPending) return Promise.resolve();
        return clearChatMutation.mutateAsync();
    }, [clearChatMutation, workflowId]);

    const updateClarificationMode = useCallback(mode => {
        setClarificationMode(mode);
        setClarificationModePreference(mode);
    }, []);

    return {
        messages,
        input,
        setInput,
        isTyping: isTyping || sharedIsTyping || historyQuery.data?.state?.phase === 'processing',
        progressLabel: sharedProgressLabel || progressLabel,
        clarificationMode,
        updateClarificationMode,
        handleSend,
        handleApply,
        handleIgnore,
        handleOption,
        acceptingProposalId,
        rejectingProposalId,
        isLoadingHistory: historyQuery.isLoading,
        hasMore: Boolean(historyQuery.data?.nextBefore),
        loadMoreHistory: undefined,
        error: historyQuery.error,
        clearChat,
        isClearingChat: clearChatMutation.isPending
    };
};
