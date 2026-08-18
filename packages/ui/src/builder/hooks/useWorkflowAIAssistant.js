import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DEFAULT_CLARIFICATION_MODE } from '../../../../shared/agentContract.js';
import { getClarificationModePreference, setClarificationModePreference } from '../../utils/storage.js';
import { clearWorkflowAIChat, decideWorkflowAIProposal, getWorkflowAIChat, resetWorkflowAIContext } from '../../api/backend.js';
import { isDurableStreamDetachError, submitWorkflowAITurnStream } from '../../api/aiStream.js';
import { useDurableTurnMonitor } from '../../api/hooks/useDurableTurnMonitor.js';
import { useAIStream } from '../../context/AIStreamContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { navigateTo } from '../../utils/router.js';
import { requestSettingsModal } from '../../utils/settingsModal.js';
import { markSupersededWorkflowProposals, markWorkflowProposalStale } from '../../components/chat/proposalStatus.js';
import { emitAITurnLifecycle } from '../../utils/browserNotifications.js';
import { outcomeForAssistantMessage } from '../../../../shared/assistantTurnNotification.js';
import { normalizeAssistantText } from '../../../../shared/assistantText.js';
import { resolveAssistantRetryRequest } from '../../utils/recoveryRetryRequest.js';

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

const normalizeInput = value => {
    if (typeof value === 'string') {
        const text = normalizeAssistantText(value);
        return { command: { type: 'submit_text', text }, text };
    }
    if (value?.type === 'decide_for_me') {
        return { command: { type: 'decide_for_me', clarificationId: value.clarificationId || null }, text: 'Use sensible defaults.' };
    }
    if (value?.type === 'retry_active_work') {
        return { command: { type: 'retry_active_work' }, text: 'Try again' };
    }
    if (value?.type === 'submit_clarification') {
        const text = String(value.text || '').trim();
        return { command: { type: 'submit_clarification', text, state: value.state || {} }, text: text || 'Submitted clarification' };
    }
    return { command: { type: 'submit_text', text: '' }, text: '' };
};

const initialHistory = state => ({
    pages: [{ messages: [], nextBefore: null, state: state || null }],
    pageParams: [null]
});

const updateLatestPage = (data, update) => {
    const current = data || initialHistory();
    const pages = [...current.pages];
    pages[0] = update(pages[0] || { messages: [], nextBefore: null, state: null });
    return { ...current, pages };
};

export const useWorkflowAIAssistant = (workflow, { onBeforeSend, initialPrompt = '' } = {}) => {
    const workflowId = workflow?.id || null;
    const queryClient = useQueryClient();
    const toast = useToast();
    const queryKey = ['workflowAI', workflowId];
    const [input, setInputState] = useState(() => readDraft(workflowId) || initialPrompt || '');
    const [clarificationMode, setClarificationMode] = useState(() => getClarificationModePreference() || DEFAULT_CLARIFICATION_MODE);
    const [acceptingProposalId, setAcceptingProposalId] = useState(null);
    const [rejectingProposalId, setRejectingProposalId] = useState(null);
    const inFlightAppliesRef = useRef(new Map());
    const inFlightTurnRef = useRef(false);
    const [isSubmittingTurn, setIsSubmittingTurn] = useState(false);
    const [streamDetached, setStreamDetached] = useState(false);
    const [recoveryMode, setRecoveryMode] = useState(false);
    const stateVersionRef = useRef(null);
    const { isTyping, setStreamState, clearStreamState } = useAIStream(workflowId);

    const syncStateVersion = useCallback(version => {
        if (Number.isInteger(version)) stateVersionRef.current = version;
    }, []);

    const updateClarificationMode = useCallback(mode => {
        setClarificationMode(mode);
        setClarificationModePreference(mode);
    }, []);

    const setInput = useCallback(value => {
        setInputState(value);
        writeDraft(workflowId, value);
    }, [workflowId]);

    useEffect(() => {
        setInputState(readDraft(workflowId) || initialPrompt || '');
    }, [workflowId, initialPrompt]);

    const {
        data,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
        isLoading: isLoadingHistory,
        refetch: refetchHistory
    } = useInfiniteQuery({
        queryKey,
        queryFn: ({ pageParam = null }) => getWorkflowAIChat(workflowId, LIMIT, pageParam),
        getNextPageParam: lastPage => lastPage?.nextBefore || undefined,
        enabled: Boolean(workflowId),
        staleTime: 0,
        refetchOnMount: 'always',
        refetchOnWindowFocus: true,
        retry: false
    });

    const assistantState = data?.pages?.[0]?.state || null;
    const serverProcessing = assistantState?.phase === 'processing';
    const messages = useMemo(() => {
        if (!data) return [defaultMessage];
        const merged = [...data.pages].reverse().flatMap(page => page.messages || []);
        const visible = markSupersededWorkflowProposals(merged, assistantState?.activeProposalMessageId);
        return visible.length ? visible : [defaultMessage];
    }, [assistantState?.activeProposalMessageId, data]);

    useEffect(() => {
        syncStateVersion(assistantState?.version);
    }, [assistantState?.version, syncStateVersion]);

    useEffect(() => {
        if (serverProcessing && !isSubmittingTurn && !isTyping && !streamDetached) setRecoveryMode(true);
        if (!serverProcessing && !streamDetached) setRecoveryMode(false);
    }, [isSubmittingTurn, isTyping, serverProcessing, streamDetached]);

    const handleRecoverySnapshot = useCallback(snapshot => {
        const recoveredState = snapshot?.pages?.[0]?.state;
        if (!streamDetached || !recoveredState || recoveredState.phase === 'processing') return;
        setStreamDetached(false);
        setRecoveryMode(false);
        clearStreamState();
    }, [clearStreamState, streamDetached]);

    useDurableTurnMonitor({
        enabled: Boolean(workflowId && (streamDetached || (serverProcessing && recoveryMode))),
        refetch: refetchHistory,
        onSnapshot: handleRecoverySnapshot
    });

    useEffect(() => {
        if (serverProcessing && !isTyping) setStreamState({ isTyping: true });
        else if (!serverProcessing && !isSubmittingTurn && isTyping && !streamDetached) clearStreamState();
    }, [serverProcessing, isSubmittingTurn, isTyping, streamDetached, setStreamState, clearStreamState]);

    const sendMutation = useMutation({
        mutationFn: ({ command, requestId, optimisticWorkId }) => submitWorkflowAITurnStream(
            workflowId,
            command,
            clarificationMode,
            progress => {
                setStreamState({ isTyping: true, requestId });
                setStreamDetached(false);
                setRecoveryMode(false);
                if (!progress.work) return;
                queryClient.setQueryData(queryKey, old => updateLatestPage(old, page => ({
                    ...page,
                    messages: (page.messages || []).map(message => message.id === optimisticWorkId
                        ? { ...message, payload: { ...(message.payload || {}), work: progress.work } }
                        : message)
                })));
            },
            { expectedStateVersion: stateVersionRef.current ?? assistantState?.version, requestId }
        ),
        onMutate: async ({ text, requestId, optimisticWorkId }) => {
            setIsSubmittingTurn(true);
            setStreamDetached(false);
            setRecoveryMode(false);
            setStreamState({ isTyping: true, requestId });
            setInput('');
            await queryClient.cancelQueries({ queryKey });
            const previousData = queryClient.getQueryData(queryKey);
            const optimisticUserId = `optimistic_user_${requestId}`;
            const startedAt = new Date().toISOString();
            const optimisticWork = {
                id: optimisticWorkId,
                sender: 'bot',
                kind: 'assistant_work',
                text: 'Drafting your workflow',
                isOptimistic: true,
                payload: { work: {
                    requestId,
                    surface: 'workflow',
                    status: 'drafting',
                    title: text,
                    currentPhase: 'understand',
                    currentActivityId: 'preparing',
                    startedAt,
                    updatedAt: startedAt,
                    activities: [{ id: 'preparing', phase: 'understand', label: 'Preparing the request', detail: 'Setting up the context for this change', status: 'active', attempt: 1, startedAt }]
                } }
            };
            queryClient.setQueryData(queryKey, old => updateLatestPage(old, page => ({
                ...page,
                messages: [...(page.messages || []), { id: optimisticUserId, sender: 'user', kind: 'text', text, isOptimistic: true }, optimisticWork]
            })));
            return { previousData, optimisticUserId, optimisticWorkId, text, requestId };
        },
        onSuccess: (result, variables, context) => {
            inFlightTurnRef.current = false;
            setIsSubmittingTurn(false);
            setStreamDetached(false);
            setRecoveryMode(false);
            clearStreamState();
            syncStateVersion(result.state?.version);
            queryClient.setQueryData(queryKey, old => updateLatestPage(old, page => {
                const currentMessages = (page.messages || []).filter(message => ![
                    context?.optimisticUserId,
                    context?.optimisticWorkId,
                    result.userMsg?.id,
                    result.botMsg?.id
                ].includes(message.id));
                const superseded = new Set(result.botMsg?.supersededMessageIds || []);
                return {
                    ...page,
                    state: result.state || page.state,
                    messages: [
                        ...currentMessages.map(message => superseded.has(message.id) ? { ...message, proposalStatus: 'superseded' } : message),
                        result.userMsg,
                        result.botMsg
                    ].filter(Boolean)
                };
            }));
            emitAITurnLifecycle({
                type: 'completed',
                requestId: variables?.requestId || context?.requestId || result?.state?.lastTurn?.requestId,
                surface: 'workflow',
                resourceId: workflowId,
                resourceName: workflow?.name || workflow?.title || 'Your workflow',
                path: `/app/automations/${encodeURIComponent(workflowId)}/build?editor=ai`,
                outcome: outcomeForAssistantMessage({
                    kind: result?.botMsg?.kind,
                    isError: result?.botMsg?.isError,
                    outcome: result?.state?.lastTurn?.outcome
                }),
                status: result?.state?.lastTurn?.status || 'completed',
                messageId: result?.botMsg?.id || result?.state?.lastTurn?.messageId || null,
                completedAt: result?.state?.lastTurn?.completedAt || new Date().toISOString()
            });
        },
        onError: async (error, variables, context) => {
            inFlightTurnRef.current = false;
            setIsSubmittingTurn(false);
            const errorCode = error?.code || error?.payload?.code;
            if (errorCode === 'WORKFLOW_AI_STATE_CONFLICT') syncStateVersion(error.currentStateVersion || error.payload?.currentStateVersion);
            if (isDurableStreamDetachError(error)) {
                setStreamDetached(true);
                setRecoveryMode(true);
                setStreamState({ isTyping: true });
                await queryClient.invalidateQueries({ queryKey });
                toast.info('Still working in the background — reconnecting.');
                return;
            }
            emitAITurnLifecycle({
                type: 'failed',
                requestId: variables?.requestId || context?.requestId,
                surface: 'workflow',
                resourceId: workflowId,
                resourceName: workflow?.name || workflow?.title || 'Your workflow',
                path: `/app/automations/${encodeURIComponent(workflowId)}/build?editor=ai`,
                outcome: 'error',
                status: 'failed',
                completedAt: new Date().toISOString()
            });
            clearStreamState();
            if (context?.previousData) queryClient.setQueryData(queryKey, context.previousData);
            setInput(context?.text || '');
            await queryClient.invalidateQueries({ queryKey });
            toast.error(error.message || 'Workflow AI could not start this request.');
        }
    });

    const decideMutation = useMutation({
        mutationFn: ({ messageId, action }) => decideWorkflowAIProposal(
            workflowId,
            messageId,
            action,
            stateVersionRef.current ?? assistantState?.version
        ),
        onSuccess: result => {
            syncStateVersion(result.state?.version);
            queryClient.setQueryData(queryKey, old => updateLatestPage(old, page => ({
                ...page,
                state: result.state || page.state,
                messages: (page.messages || []).map(message => message.id === result.message?.id ? result.message : message)
            })));
            if (result.workflow) {
                queryClient.setQueryData(['workflows', workflowId], result.workflow);
                queryClient.setQueryData(['workflows'], old => old ? old.map(item => item.id === workflowId ? result.workflow : item) : old);
            }
            queryClient.invalidateQueries({ queryKey: ['workflows', workflowId] });
        },
        onError: (error, variables) => {
            const code = error?.code || error?.payload?.code;
            if (code === 'WORKFLOW_PROPOSAL_STALE') {
                queryClient.setQueryData(queryKey, old => updateLatestPage(old, page => ({
                    ...page,
                    messages: markWorkflowProposalStale(page.messages || [], variables.messageId)
                })));
            }
            // Applying may have already persisted a Drive file ID before Google
            // failed while initialising it. Refresh that state so a retry can
            // resume the same spreadsheet rather than create another one.
            void queryClient.invalidateQueries({ queryKey });
        }
    });

    const clearChatMutation = useMutation({
        mutationFn: () => clearWorkflowAIChat(workflowId),
        onSuccess: result => {
            clearStreamState();
            syncStateVersion(result?.state?.version);
            queryClient.setQueryData(queryKey, initialHistory(result?.state));
            toast.success('Workflow AI chat cleared.');
        },
        onError: error => toast.error(error.message || 'The workflow AI chat could not be cleared.')
    });

    const resetContextMutation = useMutation({
        mutationFn: () => resetWorkflowAIContext(workflowId),
        onSuccess: result => {
            syncStateVersion(result?.state?.version);
            queryClient.setQueryData(queryKey, old => updateLatestPage(old, page => ({ ...page, state: result.state || page.state })));
            toast.success('Remembered workflow context reset.');
        },
        onError: error => toast.error(error.message || 'The remembered workflow context could not be reset.')
    });

    const handleSend = useCallback(async value => {
        const normalized = normalizeInput(value);
        if (!normalized.text || inFlightTurnRef.current || isTyping || isSubmittingTurn || serverProcessing || !workflowId) return;
        inFlightTurnRef.current = true;
        try {
            await onBeforeSend?.();
        } catch (error) {
            inFlightTurnRef.current = false;
            toast.error(error.message || 'Save the workflow before asking AI to change it.');
            return;
        }
        const requestId = globalThis.crypto?.randomUUID?.() || `workflow_turn_${Date.now()}`;
        emitAITurnLifecycle({
            type: 'started',
            requestId,
            surface: 'workflow',
            resourceId: workflowId,
            resourceName: workflow?.name || workflow?.title || 'Your workflow',
            path: `/app/automations/${encodeURIComponent(workflowId)}/build?editor=ai`,
            startedAt: new Date().toISOString()
        });
        sendMutation.mutate({
            command: normalized.command,
            text: normalized.text,
            requestId,
            optimisticWorkId: `optimistic_work_${requestId}`
        });
    }, [workflow, workflowId, isSubmittingTurn, isTyping, onBeforeSend, sendMutation, serverProcessing, toast]);

    const handleRecoveryAction = useCallback((action, message, previousRequest = '') => {
        const recovery = message?.errorMetadata?.recovery || message?.payload?.recovery || {};
        if (action?.type === 'open_form' && action.formId) {
            navigateTo({ page: 'form-detail', formId: action.formId, section: action.section || 'build' });
            return;
        }
        if (action?.type === 'open_connections') {
            requestSettingsModal('connections');
            return;
        }
        if (action?.type === 'retry' || action?.type === 'focus_composer') {
            if (action?.type === 'retry' && action.mode === 'resume_active_work') {
                void handleSend({ type: 'retry_active_work' });
                return;
            }
            const retryText = resolveAssistantRetryRequest({ action, recovery, previousRequest, messages, failureMessage: message });
            if (retryText) {
                void handleSend(retryText);
                return;
            }
            return;
        }
        setInput(recovery.suggestedPrompt || previousRequest || '');
    }, [handleSend, messages, setInput]);

    const handleApply = useCallback(async message => {
        if (message.kind !== 'workflow_proposal') return;
        const existingApply = inFlightAppliesRef.current.get(message.id);
        if (existingApply) return existingApply;

        const applyPromise = (async () => {
            setAcceptingProposalId(message.id);
            try {
                const result = await decideMutation.mutateAsync({ messageId: message.id, action: 'accept' });
                const created = result?.createdResources || [];
                toast.success(created.length ? `Workflow updated and Google Sheet “${created[0].name}” is ready.` : 'Workflow updated successfully!');
                return result;
            } catch (error) {
                const code = error?.code || error?.payload?.code;
                const needsGoogleReconnect = ['GOOGLE_RECONNECT_REQUIRED', 'GOOGLE_CONNECTION_REQUIRED', 'GOOGLE_PERMISSION_REQUIRED'].includes(code);
                const fallbackMessage = code === 'GOOGLE_PROVISIONING_UNCERTAIN'
                    ? 'Google may still be creating the spreadsheet. Wait a moment, then retry Apply safely.'
                    : 'Failed to apply changes.';
                toast.error(error.message || fallbackMessage, needsGoogleReconnect ? {
                    action: {
                        label: code === 'GOOGLE_CONNECTION_REQUIRED' ? 'Connect Google' : code === 'GOOGLE_PERMISSION_REQUIRED' ? 'Review Google access' : 'Reconnect Google',
                        onClick: () => requestSettingsModal('connections')
                    }
                } : undefined);
                throw error;
            } finally {
                setAcceptingProposalId(null);
                if (inFlightAppliesRef.current.get(message.id) === applyPromise) inFlightAppliesRef.current.delete(message.id);
            }
        })();
        inFlightAppliesRef.current.set(message.id, applyPromise);
        return applyPromise;
    }, [decideMutation, toast]);

    const handleIgnore = useCallback(async message => {
        if (message.kind !== 'workflow_proposal') return;
        setRejectingProposalId(message.id);
        try {
            await decideMutation.mutateAsync({ messageId: message.id, action: 'reject' });
            toast.success('Proposal ignored.');
        } catch (error) {
            toast.error(error.message || 'Failed to ignore proposal.');
        } finally {
            setRejectingProposalId(null);
        }
    }, [decideMutation, toast]);

    const handleOption = useCallback(option => {
        if (option?.type === 'regenerate_proposal') {
            if (option.text) handleSend(option.text);
            return;
        }
        handleSend(option);
    }, [handleSend]);

    const clearChat = useCallback(() => {
        if (!workflowId || clearChatMutation.isPending) return Promise.resolve();
        return clearChatMutation.mutateAsync();
    }, [clearChatMutation, workflowId]);

    return {
        messages,
        input,
        setInput,
        isTyping: isTyping || isSubmittingTurn || serverProcessing,
        clarificationMode,
        updateClarificationMode,
        handleSend,
        handleApply,
        handleIgnore,
        handleRecoveryAction,
        handleOption,
        acceptingProposalId,
        rejectingProposalId,
        isLoadingHistory: isLoadingHistory && messages.length === 1 && messages[0].id === defaultMessage.id,
        hasMore: Boolean(hasNextPage),
        loadMoreHistory: fetchNextPage,
        isLoadingMore: isFetchingNextPage,
        clearChat,
        isClearingChat: clearChatMutation.isPending,
        resetContext: () => workflowId ? resetContextMutation.mutateAsync() : Promise.resolve(),
        isResettingContext: resetContextMutation.isPending
    };
};
