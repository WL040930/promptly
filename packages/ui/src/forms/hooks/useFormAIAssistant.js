import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clearFormAIChat, decideFormProposal, getFormChatHistory, resetFormAIContext } from '../../api/backend.js';
import { isDurableStreamDetachError, submitFormAITurnStream } from '../../api/aiStream.js';
import { useDurableTurnMonitor } from '../../api/hooks/useDurableTurnMonitor.js';
import { useToast } from '../../context/ToastContext.jsx';
import { useAIStream } from '../../context/AIStreamContext.jsx';
import { useWorkspaceScope } from '../../context/WorkspaceScopeContext.jsx';
import { DEFAULT_CLARIFICATION_MODE } from '../../../../shared/agentContract.js';
import { getClarificationModePreference, setClarificationModePreference } from '../../utils/storage.js';
import { navigateTo } from '../../utils/router.js';
import { requestSettingsModal } from '../../utils/settingsModal.js';
import { emitAITurnLifecycle } from '../../utils/browserNotifications.js';
import { outcomeForAssistantMessage } from '../../../../shared/assistantTurnNotification.js';
import { resolveAssistantRetryRequest } from '../../utils/recoveryRetryRequest.js';

const LIMIT = 50;
const defaultMessage = {
    id: 'form_ai_init',
    sender: 'bot',
    kind: 'text',
    text: "Hi! I'm your AI form designer. Describe what kind of form you want to build, or ask me to add specific fields."
};

const draftKeyFor = formId => `promptly.form-ai.draft.${formId}`;

const readDraft = formId => {
    if (!formId || typeof window === 'undefined') return '';
    try { return sessionStorage.getItem(draftKeyFor(formId)) || ''; } catch { return ''; }
};

const writeDraft = (formId, value) => {
    if (!formId || typeof window === 'undefined') return;
    try {
        if (value) sessionStorage.setItem(draftKeyFor(formId), value);
        else sessionStorage.removeItem(draftKeyFor(formId));
    } catch { /* Draft persistence is best effort. */ }
};

const normalizeInput = value => {
    if (typeof value === 'string') {
        const text = value.trim();
        return { command: { type: 'submit_text', text }, text };
    }
    if (value?.type === 'decide_for_me') {
        return { command: { type: 'decide_for_me', clarificationId: value.clarificationId || null }, text: 'Use sensible defaults.' };
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

export const useFormAIAssistant = (form, { onBeforeSend, onFormApplied } = {}) => {
    const formId = form?.id || null;
    const queryClient = useQueryClient();
    const toast = useToast();
    const { scope } = useWorkspaceScope();
    const queryKey = ['formChat', formId];
    const [input, setInputState] = useState(() => readDraft(formId));
    const [clarificationMode, setClarificationMode] = useState(() => getClarificationModePreference() || DEFAULT_CLARIFICATION_MODE);
    const [acceptingProposalId, setAcceptingProposalId] = useState(null);
    const [rejectingProposalId, setRejectingProposalId] = useState(null);
    const [pendingFormDeletionReview, setPendingFormDeletionReview] = useState(null);
    const [isSubmittingTurn, setIsSubmittingTurn] = useState(false);
    const [streamDetached, setStreamDetached] = useState(false);
    const [recoveryMode, setRecoveryMode] = useState(false);
    const stateVersionRef = useRef(null);
    const { isTyping, setStreamState, clearStreamState } = useAIStream(formId);

    const syncStateVersion = useCallback(version => {
        if (Number.isInteger(version)) stateVersionRef.current = version;
    }, []);

    const updateClarificationMode = useCallback(mode => {
        setClarificationMode(mode);
        setClarificationModePreference(mode);
    }, []);

    const setInput = useCallback(value => {
        setInputState(value);
        writeDraft(formId, value);
    }, [formId]);

    useEffect(() => {
        setInputState(readDraft(formId));
    }, [formId]);

    const {
        data,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
        isLoading: isLoadingHistory,
        refetch: refetchHistory
    } = useInfiniteQuery({
        queryKey,
        queryFn: ({ pageParam = null }) => getFormChatHistory(formId, LIMIT, pageParam),
        getNextPageParam: lastPage => lastPage?.nextBefore || undefined,
        enabled: Boolean(formId),
        staleTime: 0,
        refetchOnMount: 'always',
        refetchOnWindowFocus: true,
        retry: false
    });

    const messages = useMemo(() => {
        if (!data) return [defaultMessage];
        const merged = [...data.pages].reverse().flatMap(page => page.messages || []);
        return merged.length > 0 ? merged : [defaultMessage];
    }, [data]);

    const assistantState = data?.pages?.[0]?.state || null;
    const serverProcessing = assistantState?.phase === 'processing';

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
        enabled: Boolean(formId && (streamDetached || (serverProcessing && recoveryMode))),
        refetch: refetchHistory,
        onSnapshot: handleRecoverySnapshot
    });

    useEffect(() => {
        if (serverProcessing && !isTyping) setStreamState({ isTyping: true });
        else if (!serverProcessing && !isSubmittingTurn && isTyping && !streamDetached) clearStreamState();
    }, [serverProcessing, isSubmittingTurn, isTyping, streamDetached, setStreamState, clearStreamState]);

    const sendMutation = useMutation({
        mutationFn: ({ command, requestId, optimisticWorkId }) => submitFormAITurnStream(
            formId,
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
                text: 'Drafting your form',
                isOptimistic: true,
                payload: { work: {
                    requestId,
                    surface: 'form',
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
                const stale = new Set(result.staleProposalMessageIds || []);
                return {
                    ...page,
                    state: result.state || page.state,
                    messages: [
                        ...currentMessages.map(message => superseded.has(message.id)
                            ? { ...message, proposalStatus: 'superseded' }
                            : stale.has(message.id)
                                ? { ...message, proposalStatus: 'stale' }
                                : message),
                        result.userMsg,
                        result.botMsg
                    ].filter(Boolean)
                };
            }));
            emitAITurnLifecycle({
                type: 'completed',
                requestId: variables?.requestId || context?.requestId || result?.state?.lastTurn?.requestId,
                surface: 'form',
                resourceId: formId,
                resourceName: form?.title || 'Your form',
                path: `/app/forms/${encodeURIComponent(formId)}/build`,
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
            setIsSubmittingTurn(false);
            const errorCode = error?.code || error?.payload?.code;
            if (errorCode === 'FORM_AI_STATE_CONFLICT') syncStateVersion(error.currentStateVersion || error.payload?.currentStateVersion);
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
                surface: 'form',
                resourceId: formId,
                resourceName: form?.title || 'Your form',
                path: `/app/forms/${encodeURIComponent(formId)}/build`,
                outcome: 'error',
                status: 'failed',
                completedAt: new Date().toISOString()
            });
            clearStreamState();
            if (context?.previousData) queryClient.setQueryData(queryKey, context.previousData);
            setInput(context?.text || '');
            await queryClient.invalidateQueries({ queryKey });
            toast.error(error.message || 'Form AI could not start this request.');
        }
    });

    const clearChatMutation = useMutation({
        mutationFn: () => clearFormAIChat(formId),
        onSuccess: result => {
            clearStreamState();
            syncStateVersion(result?.state?.version);
            queryClient.setQueryData(queryKey, initialHistory(result?.state));
            toast.success('Form AI chat cleared.');
        },
        onError: error => toast.error(error.message || 'The form AI chat could not be cleared.')
    });

    const resetContextMutation = useMutation({
        mutationFn: () => resetFormAIContext(formId),
        onSuccess: result => {
            syncStateVersion(result?.state?.version);
            queryClient.setQueryData(queryKey, old => updateLatestPage(old, page => ({ ...page, state: result.state || page.state })));
            toast.success('Remembered form context reset.');
        },
        onError: error => toast.error(error.message || 'The remembered form context could not be reset.')
    });

    const handleSend = useCallback(async value => {
        const normalized = normalizeInput(value);
        if (!normalized.text || isTyping || isSubmittingTurn || serverProcessing || !formId) return;
        try {
            await onBeforeSend?.();
        } catch (error) {
            toast.error(error.message || 'Save the form before asking AI to change it.');
            return;
        }
        const requestId = globalThis.crypto?.randomUUID?.() || `form_turn_${Date.now()}`;
        emitAITurnLifecycle({
            type: 'started',
            requestId,
            surface: 'form',
            resourceId: formId,
            resourceName: form?.title || 'Your form',
            path: `/app/forms/${encodeURIComponent(formId)}/build`,
            startedAt: new Date().toISOString()
        });
        sendMutation.mutate({
            command: normalized.command,
            text: normalized.text,
            requestId,
            optimisticWorkId: `optimistic_work_${requestId}`
        });
    }, [form, formId, isSubmittingTurn, isTyping, onBeforeSend, sendMutation, serverProcessing, toast]);

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
            const retryText = resolveAssistantRetryRequest({ action, recovery, previousRequest, messages, failureMessage: message });
            if (retryText) {
                void handleSend(retryText);
                return;
            }
            if (action?.type === 'retry') return;
        }
        setInput(recovery.suggestedPrompt || previousRequest || '');
    }, [handleSend, messages, setInput]);

    const handleAcceptProposal = useCallback(async (messageId, selectedPatchIds = null, fieldDeletionReview = null) => {
        setAcceptingProposalId(messageId);
        let requestedPatchIds = selectedPatchIds;
        try {
            const message = messages.find(item => item.id === messageId);
            const patches = message?.payload?.patches || [];
            requestedPatchIds = selectedPatchIds || patches.map((patch, index) => patch.patchId || `patch_${index + 1}`);
            const result = await decideFormProposal(formId, messageId, {
                action: 'accept',
                selectedPatchIds: requestedPatchIds,
                expectedStateVersion: stateVersionRef.current ?? assistantState?.version,
                ...(fieldDeletionReview ? { fieldDeletionReview } : {})
            });
            setPendingFormDeletionReview(null);
            syncStateVersion(result.state?.version);
            queryClient.setQueryData(['forms', { scope }], old => old ? old.map(item => item.id === formId ? result.form : item) : old);
            queryClient.setQueryData(['forms', formId, { scope }], result.form);
            queryClient.setQueryData(queryKey, old => updateLatestPage(old, page => ({
                ...page,
                state: result.state || page.state,
                messages: (page.messages || []).map(message => message.id === messageId
                    ? { ...message, payload: result.message?.payload || message.payload, proposalStatus: result.message?.proposalStatus || 'applied' }
                    : message)
            })));
            await onFormApplied?.(result.form);
            toast.success('Form updated successfully!');
        } catch (error) {
            const code = error.code || error.payload?.code;
            if (['FORM_FIELD_DELETION_REVIEW_REQUIRED', 'FORM_FIELD_DELETION_LIVE_DEPENDENCY', 'FORM_FIELD_DELETION_BLOCKED'].includes(code)) {
                setPendingFormDeletionReview({
                    messageId,
                    selectedPatchIds: requestedPatchIds,
                    preview: error.preview || error.payload?.preview || null
                });
                toast.info('Review the affected workflows before applying this form change.');
                return;
            }
            if (code === 'FORM_PROPOSAL_STALE') {
                queryClient.setQueryData(queryKey, old => updateLatestPage(old, page => ({
                    ...page,
                    messages: (page.messages || []).map(message => message.id === messageId ? { ...message, proposalStatus: 'stale' } : message)
                })));
                await queryClient.invalidateQueries({ queryKey });
            }
            toast.error(code === 'FORM_PROPOSAL_STALE' ? 'This suggestion is outdated. Generate a new one.' : error.message || 'Failed to apply changes.');
        } finally {
            setAcceptingProposalId(null);
        }
    }, [assistantState?.version, formId, messages, onFormApplied, queryClient, queryKey, toast, syncStateVersion]);

    const confirmFormDeletionReview = useCallback(async () => {
        if (!pendingFormDeletionReview?.preview?.canApply) return;
        await handleAcceptProposal(
            pendingFormDeletionReview.messageId,
            pendingFormDeletionReview.selectedPatchIds,
            {
                confirmed: true,
                workflowRevisions: pendingFormDeletionReview.preview.workflowRevisions || {}
            }
        );
    }, [handleAcceptProposal, pendingFormDeletionReview]);

    const handleRejectProposal = useCallback(async messageId => {
        setRejectingProposalId(messageId);
        try {
            const result = await decideFormProposal(formId, messageId, {
                action: 'reject',
                expectedStateVersion: stateVersionRef.current ?? assistantState?.version
            });
            syncStateVersion(result.state?.version);
            queryClient.setQueryData(queryKey, old => updateLatestPage(old, page => ({
                ...page,
                state: result.state || page.state,
                messages: (page.messages || []).map(message => message.id === messageId
                    ? { ...message, payload: result.message?.payload || message.payload, proposalStatus: result.message?.proposalStatus || 'rejected' }
                    : message)
            })));
            toast.success('Proposal ignored.');
        } catch (error) {
            toast.error(error.message || 'Failed to reject proposal.');
        } finally {
            setRejectingProposalId(null);
        }
    }, [assistantState?.version, formId, queryClient, queryKey, toast, syncStateVersion]);

    const clearChat = useCallback(() => {
        if (!formId || clearChatMutation.isPending) return Promise.resolve();
        return clearChatMutation.mutateAsync();
    }, [clearChatMutation, formId]);

    return {
        messages,
        input,
        setInput,
        clarificationMode,
        setClarificationMode: updateClarificationMode,
        isTyping: isTyping || isSubmittingTurn || serverProcessing,
        isLoadingHistory: isLoadingHistory && messages.length === 1 && messages[0].id === defaultMessage.id,
        hasMore: Boolean(hasNextPage),
        loadMoreHistory: fetchNextPage,
        isLoadingMore: isFetchingNextPage,
        handleSend,
        handleAcceptProposal,
        handleRejectProposal,
        handleRecoveryAction,
        pendingFormDeletionReview,
        closeFormDeletionReview: () => setPendingFormDeletionReview(null),
        confirmFormDeletionReview,
        acceptingProposalId,
        rejectingProposalId,
        clearChat,
        isClearingChat: clearChatMutation.isPending,
        resetContext: () => formId ? resetContextMutation.mutateAsync() : Promise.resolve(),
        isResettingContext: resetContextMutation.isPending
    };
};
