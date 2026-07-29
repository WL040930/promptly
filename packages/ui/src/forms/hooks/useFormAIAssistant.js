import { useState, useCallback, useEffect, useMemo } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clearFormAIChat, decideFormProposal, getFormChatHistory, resetFormAIContext } from '../../api/backend.js';
import { submitFormAITurnStream } from '../../api/aiStream.js';
import { useToast } from '../../context/ToastContext.jsx';
import { useAIStream } from '../../context/AIStreamContext.jsx';
import { DEFAULT_CLARIFICATION_MODE } from '../../../../shared/agentContract.js';
import { getClarificationModePreference, setClarificationModePreference } from '../../utils/storage.js';
import { navigateTo } from '../../utils/router.js';

const LIMIT = 50;
const RETRYABLE_ERROR_CODES = new Set([
    'FORM_AI_RATE_LIMITED',
    'FORM_AI_PROVIDER_TIMEOUT',
    'FORM_AI_PROVIDER_UNAVAILABLE',
    'FORM_AI_STREAM_TIMEOUT',
    'FORM_AI_STREAM_INCOMPLETE',
    'FORM_AI_STREAM_START_FAILED'
]);
const defaultMessage = {
    id: 'init',
    sender: 'bot',
    text: "Hi! I'm your AI form designer. Describe what kind of form you want to build, or ask me to add specific fields.",
};

const getErrorMetadata = (error) => {
    const code = error?.code?.startsWith('FORM_AI_') ? error.code : 'FORM_AI_GENERATION_FAILED';
    const issue = Array.isArray(error?.issues) ? error.issues[0] : null;

    return {
        code,
        retryable: RETRYABLE_ERROR_CODES.has(code),
        ...(typeof issue?.path === 'string' && issue.path ? { stage: issue.path } : {})
    };
};

export const useFormAIAssistant = (form) => {
    const queryClient = useQueryClient();
    const toast = useToast();
    const [input, setInput] = useState('');
    const [clarificationMode, setClarificationMode] = useState(() => getClarificationModePreference() || DEFAULT_CLARIFICATION_MODE);
    const [aiStateVersion, setAIStateVersion] = useState(null);
    const [acceptingProposalId, setAcceptingProposalId] = useState(null);
    const [rejectingProposalId, setRejectingProposalId] = useState(null);
    const [isSubmittingTurn, setIsSubmittingTurn] = useState(false);
    const { isTyping, setStreamState, clearStreamState } = useAIStream(form?.id);

    const queryKey = ['formChat', form?.id];

    const updateClarificationMode = useCallback(mode => {
        setClarificationMode(mode);
        setClarificationModePreference(mode);
    }, []);

    const {
        data,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
        isLoading: isLoadingHistory,
        refetch: refetchHistory
    } = useInfiniteQuery({
        queryKey,
        queryFn: async ({ pageParam = 0 }) => {
            const history = await getFormChatHistory(form.id, LIMIT, pageParam);
            return {
                messages: history?.messages || [],
                state: history?.state || null,
                nextOffset: history?.messages?.length === LIMIT ? pageParam + LIMIT : undefined
            };
        },
        getNextPageParam: (lastPage) => lastPage.nextOffset,
        enabled: !!form?.id,
        staleTime: 1000 * 60 * 5, // Cache for 5 minutes
    });

    // Combine pages chronologically
    const rawMessages = useMemo(() => {
        if (!data) return [defaultMessage];
        // data.pages is [page0 (latest), page1 (older), page2 (oldest)].
        // We reverse the pages array so oldest page comes first, then flatMap.
        const allMessages = [...data.pages].reverse().flatMap(page => page.messages);
        return allMessages.length > 0 ? allMessages : [defaultMessage];
    }, [data]);

    const assistantState = data?.pages?.[0]?.state || null;
    const serverProcessing = assistantState?.phase === 'processing';

    useEffect(() => {
        if (Number.isInteger(assistantState?.version)) setAIStateVersion(assistantState.version);
    }, [assistantState?.version]);

    useEffect(() => {
        if (!form?.id || !serverProcessing) return undefined;
        const interval = setInterval(() => refetchHistory(), 2000);
        return () => clearInterval(interval);
    }, [form?.id, serverProcessing, refetchHistory]);

    useEffect(() => {
        if (serverProcessing && !isTyping) {
            setStreamState({ isTyping: true });
        } else if (!serverProcessing && !isSubmittingTurn && isTyping) {
            clearStreamState();
        }
    }, [serverProcessing, isSubmittingTurn, isTyping, setStreamState, clearStreamState]);

    const sendMessageMutation = useMutation({
        mutationFn: async ({ text, command, optimisticWorkId, requestId }) => {
            const result = await submitFormAITurnStream(form.id, command, clarificationMode, (progress) => {
                setStreamState({ isTyping: true });
                if (progress.work) queryClient.setQueryData(queryKey, old => old ? {
                    ...old,
                    pages: old.pages.map((page, index) => index === 0 ? {
                        ...page,
                        messages: page.messages.map(message => message.id === optimisticWorkId
                            ? { ...message, payload: { ...(message.payload || {}), work: progress.work } }
                            : message)
                    } : page)
                } : old);
            }, { expectedStateVersion: aiStateVersion, requestId });
            return result;
        },
        onMutate: async ({ text, optimisticWorkId, requestId }) => {
            setIsSubmittingTurn(true);
            setStreamState({ isTyping: true });
            setInput('');
            await queryClient.cancelQueries({ queryKey });

            const previousData = queryClient.getQueryData(queryKey);
            const optimisticUserId = Date.now().toString();
            const startedAt = new Date().toISOString();
            const optimisticWork = {
                id: optimisticWorkId, sender: 'bot', kind: 'assistant_work', text: 'Drafting your form', isOptimistic: true,
                payload: { work: { requestId, surface: 'form', status: 'drafting', title: text, currentPhase: 'understand', currentActivityId: 'preparing', startedAt, updatedAt: startedAt, activities: [{ id: 'preparing', phase: 'understand', label: 'Preparing the request', detail: 'Setting up the context for this change', status: 'active', attempt: 1, startedAt }] } }
            };

            // Optimistically update the UI by appending the message to the first page (since it represents the latest chunk)
            queryClient.setQueryData(queryKey, (old) => {
                if (!old) return old;
                const newPages = [...old.pages];
                newPages[0] = {
                    ...newPages[0],
                    messages: [...newPages[0].messages, { id: optimisticUserId, sender: 'user', text, isOptimistic: true }, optimisticWork]
                };
                return { ...old, pages: newPages };
            });

            return { previousData, optimisticUserId, optimisticWorkId };
        },
        onError: async (err, variables, context) => {
            setIsSubmittingTurn(false);
            clearStreamState();
            if (context?.previousData) {
                queryClient.setQueryData(queryKey, context.previousData);
            }
            
            // Show error message
            const safeErrorMessage = err?.code?.startsWith('FORM_AI_')
                ? err.message
                : 'Failed to generate form with AI.';
            toast.error(safeErrorMessage);

            queryClient.setQueryData(queryKey, (old) => {
                if (!old) return old;
                const newPages = [...old.pages];
                const currentMessages = [...newPages[0].messages];
                if (variables?.text && !currentMessages.some(message => message.id === context?.optimisticUserId)) {
                    currentMessages.push({
                        id: context?.optimisticUserId || `failed_${Date.now()}`,
                        sender: 'user',
                        text: variables.text
                    });
                }
                newPages[0] = {
                    ...newPages[0],
                    messages: [...currentMessages, {
                        id: Date.now().toString(),
                        sender: 'bot',
                        text: safeErrorMessage,
                        isError: true,
                        errorMetadata: getErrorMetadata(err)
                    }]
                };
                return { ...old, pages: newPages };
            });
        },
        onSuccess: (data, variables, context) => {
            setIsSubmittingTurn(false);
            clearStreamState();
            if (Number.isInteger(data.state?.version)) setAIStateVersion(data.state.version);
            queryClient.setQueryData(queryKey, (old) => {
                if (!old) return old;
                const newPages = [...old.pages];
                // Remove optimistic message and any existing copies of the userMsg/botMsg that might have been fetched from DB
                let currentMessages = newPages[0].messages.filter(m => 
                    m.id !== context.optimisticUserId &&
                    m.id !== context.optimisticWorkId &&
                    m.id !== data.userMsg.id &&
                    m.id !== data.botMsg.id
                );
                const supersededMessageIds = new Set(data.botMsg.supersededMessageIds || []);
                if (supersededMessageIds.size > 0) {
                    currentMessages = currentMessages.map(message => supersededMessageIds.has(message.id)
                        ? { 
                            ...message, 
                            proposalStatus: 'superseded'
                          }
                        : message);
                }
                newPages[0] = {
                    ...newPages[0],
                    messages: [...currentMessages, data.userMsg, data.botMsg],
                    state: data.state || null
                };
                return { ...old, pages: newPages };
            });
        }
    });

    const clearChatMutation = useMutation({
        mutationFn: () => clearFormAIChat(form.id),
        onSuccess: result => {
            clearStreamState();
            if (Number.isInteger(result?.state?.version)) setAIStateVersion(result.state.version);
            queryClient.setQueryData(queryKey, { pages: [{ messages: [], nextOffset: undefined, state: result.state || null }], pageParams: [0] });
            toast.success('Form AI chat cleared.');
        },
        onError: error => {
            toast.error(error.message || 'The form AI chat could not be cleared.');
        }
    });

    const resetContextMutation = useMutation({
        mutationFn: () => resetFormAIContext(form.id),
        onSuccess: result => {
            if (Number.isInteger(result?.state?.version)) setAIStateVersion(result.state.version);
            toast.success('Remembered form context reset.');
        },
        onError: error => toast.error(error.message || 'The remembered form context could not be reset.')
    });

    const handleSend = useCallback((value, command = null) => {
        let text = '';
        let nextCommand = command;

        if (typeof value === 'string') {
            text = value;
            nextCommand = nextCommand || { type: 'submit_text', text };
        } else if (value?.type === 'decide_for_me') {
            text = 'Use sensible defaults.';
            nextCommand = nextCommand || value;
        } else if (value?.type === 'submit_clarification') {
            text = value.text || 'Submitted clarification';
            nextCommand = nextCommand || value;
        } else {
            text = String(value?.name || value?.title || value?.label || '');
            nextCommand = nextCommand || { type: 'submit_text', text };
        }

        if (!text.trim() || isTyping || isSubmittingTurn || serverProcessing || !form?.id) return;
        const requestId = globalThis.crypto?.randomUUID?.() || `form_turn_${Date.now()}`;
        sendMessageMutation.mutate({ text, command: nextCommand, requestId, optimisticWorkId: `optimistic_work_${requestId}` });
    }, [form?.id, isTyping, isSubmittingTurn, serverProcessing, sendMessageMutation]);

    const handleRecoveryAction = useCallback((action, message, previousRequest = '') => {
        const recovery = message?.errorMetadata?.recovery || message?.payload?.recovery || {};
        if (action?.type === 'open_form' && action.formId) {
            navigateTo({ page: 'form-detail', formId: action.formId, section: action.section || 'build' });
            return;
        }
        if (action?.type === 'open_connections') {
            navigateTo({ page: 'settings', section: 'connections' });
            return;
        }
        if (action?.type === 'retry') {
            const retryText = recovery.retryText || previousRequest;
            if (retryText) handleSend(retryText);
            return;
        }
        setInput(recovery.suggestedPrompt || previousRequest || '');
    }, [handleSend]);

    const handleAcceptProposal = useCallback(async (msgId, unselectedIndices = []) => {
        setAcceptingProposalId(msgId);
        try {
            const msg = rawMessages.find(m => m.id === msgId);
            const originalProposal = msg?.payload || {};
            const patches = originalProposal.patches || [];
            const selectedPatchIds = patches
                .map((patch, index) => ({ patch, index, patchId: patch.patchId || `patch_${index + 1}` }))
                .filter(({ index }) => !unselectedIndices.includes(index))
                .map(({ patchId }) => patchId);

            const result = await decideFormProposal(form.id, msgId, {
                action: 'accept',
                selectedPatchIds,
                baseFormUpdatedAt: originalProposal.baseFormUpdatedAt || form.updatedAt
            });
            if (Number.isInteger(result.state?.version)) setAIStateVersion(result.state.version);

            queryClient.setQueryData(['forms'], old => old ? old.map(item => item.id === form.id ? result.form : item) : old);
            queryClient.setQueryData(['forms', form.id], result.form);
            queryClient.setQueryData(queryKey, old => {
                if (!old) return old;
                return {
                    ...old,
                    pages: old.pages.map(page => ({
                        ...page,
                        messages: page.messages.map(message => message.id === msgId
                            ? { ...message, payload: result.message?.payload || message.payload, proposalStatus: result.message?.proposalStatus || 'applied' }
                            : message)
                    }))
                };
            });

            toast.success('Form updated successfully!');
        } catch (error) {
            console.error('Error applying proposal:', error);
            if (error.payload?.code === 'FORM_PROPOSAL_STALE') {
                queryClient.setQueryData(queryKey, old => {
                    if (!old) return old;
                    return {
                        ...old,
                        pages: old.pages.map(page => ({
                            ...page,
                        messages: page.messages.map(message => message.id === msgId
                                ? { ...message, proposalStatus: 'stale' }
                                : message)
                        }))
                    };
                });
                await queryClient.invalidateQueries({ queryKey });
            }
            toast.error(error.payload?.code === 'FORM_PROPOSAL_STALE'
                ? 'This suggestion is outdated. Generate a new one.'
                : error.message || 'Failed to apply changes.');
        } finally {
            setAcceptingProposalId(null);
        }
    }, [form, queryClient, queryKey, toast, rawMessages]);

    const handleRejectProposal = useCallback(async (msgId) => {
        setRejectingProposalId(msgId);
        try {
            const result = await decideFormProposal(form.id, msgId, { action: 'reject' });
            if (Number.isInteger(result.state?.version)) setAIStateVersion(result.state.version);
            queryClient.setQueryData(queryKey, old => {
                if (!old) return old;
                return {
                    ...old,
                    pages: old.pages.map(page => ({
                        ...page,
                        messages: page.messages.map(message => message.id === msgId
                            ? { ...message, payload: result.message?.payload || message.payload, proposalStatus: result.message?.proposalStatus || 'rejected' }
                            : message)
                    }))
                };
            });
            toast.success('Proposal rejected.');
        } catch (error) {
            toast.error(error.message || 'Failed to reject proposal.');
        } finally {
            setRejectingProposalId(null);
        }
    }, [form?.id, queryClient, queryKey, toast]);

    const clearChat = useCallback(() => {
        if (!form?.id || clearChatMutation.isPending) return Promise.resolve();
        return clearChatMutation.mutateAsync();
    }, [clearChatMutation, form?.id]);

    return {
        messages: rawMessages,
        input,
        setInput,
        clarificationMode,
        setClarificationMode: updateClarificationMode,
        isTyping: isTyping || isSubmittingTurn || serverProcessing,
        isLoadingHistory: isLoadingHistory && rawMessages.length === 1 && rawMessages[0].id === 'init', // Only show main loader on first ever fetch
        hasMore: !!hasNextPage,
        loadMoreHistory: fetchNextPage,
        handleSend,
        handleAcceptProposal,
        handleRejectProposal,
        handleRecoveryAction,
        acceptingProposalId,
        rejectingProposalId,
        clearChat,
        isClearingChat: clearChatMutation.isPending,
        resetContext: () => form?.id ? resetContextMutation.mutateAsync() : Promise.resolve(),
        isResettingContext: resetContextMutation.isPending
    };
};
