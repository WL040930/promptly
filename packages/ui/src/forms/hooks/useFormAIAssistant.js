import { useState, useCallback, useMemo } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { acceptFormProposal, getFormChatHistory, updateFormChatMessage } from '../../api/backend.js';
import { submitFormAITurnStream } from '../../api/aiStream.js';
import { useToast } from '../../context/ToastContext.jsx';
import { useAIStream } from '../../context/AIStreamContext.jsx';
import { DEFAULT_CLARIFICATION_MODE } from '../../../../shared/agentContract.js';
import { getClarificationModePreference, setClarificationModePreference } from '../../utils/storage.js';

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
    const { isTyping, progressLabel, setStreamState, clearStreamState } = useAIStream(form?.id);

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
        isLoading: isLoadingHistory
    } = useInfiniteQuery({
        queryKey,
        queryFn: async ({ pageParam = 0 }) => {
            const history = await getFormChatHistory(form.id, LIMIT, pageParam);
            return {
                messages: history || [],
                nextOffset: history?.length === LIMIT ? pageParam + LIMIT : undefined
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

    const sendMessageMutation = useMutation({
        mutationFn: async ({ text, command }) => {
            const result = await submitFormAITurnStream(form.id, command, clarificationMode, (progress) => {
                setStreamState({ progressLabel: progress.message || 'Thinking...' });
            }, { expectedStateVersion: aiStateVersion });
            return result;
        },
        onMutate: async ({ text }) => {
            setStreamState({ isTyping: true, progressLabel: 'Thinking...' });
            setInput('');
            await queryClient.cancelQueries({ queryKey });

            const previousData = queryClient.getQueryData(queryKey);
            const optimisticUserId = Date.now().toString();

            // Optimistically update the UI by appending the message to the first page (since it represents the latest chunk)
            queryClient.setQueryData(queryKey, (old) => {
                if (!old) return old;
                const newPages = [...old.pages];
                newPages[0] = {
                    ...newPages[0],
                    messages: [...newPages[0].messages, { id: optimisticUserId, sender: 'user', text, isOptimistic: true }]
                };
                return { ...old, pages: newPages };
            });

            return { previousData, optimisticUserId };
        },
        onError: async (err, variables, context) => {
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
            clearStreamState();
            if (Number.isInteger(data.state?.version)) setAIStateVersion(data.state.version);
            queryClient.setQueryData(queryKey, (old) => {
                if (!old) return old;
                const newPages = [...old.pages];
                // Remove optimistic message and any existing copies of the userMsg/botMsg that might have been fetched from DB
                let currentMessages = newPages[0].messages.filter(m => 
                    m.id !== context.optimisticUserId && 
                    m.id !== data.userMsg.id &&
                    m.id !== data.botMsg.id
                );
                const supersededMessageIds = new Set(data.botMsg.supersededMessageIds || []);
                if (supersededMessageIds.size > 0) {
                    currentMessages = currentMessages.map(message => supersededMessageIds.has(message.id)
                        ? { ...message, proposal: { ...message.proposal, status: 'superseded' } }
                        : message);
                }
                newPages[0] = {
                    ...newPages[0],
                    messages: [...currentMessages, data.userMsg, data.botMsg]
                };
                return { ...old, pages: newPages };
            });
        }
    });

    const updateProposalMutation = useMutation({
        mutationFn: async ({ msgId, originalProposal, status, schema, unselectedIndices }) => {
            const updates = { 
                proposal: { 
                    ...originalProposal, 
                    status,
                    ...(schema ? { schema } : {}),
                    ...(unselectedIndices ? { unselectedPatchIndices: unselectedIndices } : {})
                } 
            };
            const result = await updateFormChatMessage(msgId, updates);
            return { msgId, status, updates, stateVersion: result.stateVersion };
        },
        onMutate: async ({ msgId, originalProposal, status, schema, unselectedIndices }) => {
            await queryClient.cancelQueries({ queryKey });
            const previousData = queryClient.getQueryData(queryKey);

            // Optimistic UI update
            queryClient.setQueryData(queryKey, (old) => {
                if (!old) return old;
                return {
                    ...old,
                    pages: old.pages.map(page => ({
                        ...page,
                        messages: page.messages.map(msg => 
                            msg.id === msgId ? { 
                                ...msg, 
                                proposal: { 
                                    ...msg.proposal, 
                                    status,
                                    ...(schema ? { schema } : {}),
                                    ...(unselectedIndices ? { unselectedPatchIndices: unselectedIndices } : {})
                                } 
                            } : msg
                        )
                    }))
                };
            });
            return { previousData };
        },
        onError: (err, variables, context) => {
            if (context?.previousData) {
                queryClient.setQueryData(queryKey, context.previousData);
            }
            toast.error(`Failed to ${variables.status} proposal.`);
        },
        onSuccess: (data) => {
            if (Number.isInteger(data?.stateVersion)) setAIStateVersion(data.stateVersion);
        }
    });

    const handleSend = useCallback((value, command = null) => {
        const text = typeof value === 'string'
            ? value
            : (value?.type === 'decide_for_me'
                ? 'Use sensible defaults.'
                : String(value?.name || value?.title || value?.label || ''));
        const nextCommand = command || { type: 'submit_text', text };
        if (!text.trim() || isTyping || !form?.id) return;
        sendMessageMutation.mutate({ text, command: nextCommand });
    }, [form?.id, isTyping, sendMessageMutation]);

    const handleAcceptProposal = useCallback(async (msgId, unselectedIndices = []) => {
        setAcceptingProposalId(msgId);
        try {
            const msg = rawMessages.find(m => m.id === msgId);
            const originalProposal = msg?.proposal || {};
            const patches = originalProposal.patches || [];
            const selectedPatchIds = patches
                .map((patch, index) => ({ patch, index, patchId: patch.patchId || `patch_${index + 1}` }))
                .filter(({ index }) => !unselectedIndices.includes(index))
                .map(({ patchId }) => patchId);

            const result = await acceptFormProposal(form.id, msgId, {
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
                            ? { ...message, proposal: result.proposal }
                            : message)
                    }))
                };
            });

            toast.success('Form updated successfully!');
        } catch (error) {
            console.error('Error applying proposal:', error);
            if (error.payload?.code === 'FORM_PROPOSAL_STALE') {
                const message = rawMessages.find(item => item.id === msgId);
                if (message?.proposal) {
                    try {
                        await updateProposalMutation.mutateAsync({
                            msgId,
                            originalProposal: message.proposal,
                            status: 'stale'
                        });
                    } catch (persistError) {
                        console.error('Failed to persist stale form proposal:', persistError);
                    }
                }
                queryClient.setQueryData(queryKey, old => {
                    if (!old) return old;
                    return {
                        ...old,
                        pages: old.pages.map(page => ({
                            ...page,
                            messages: page.messages.map(message => message.id === msgId
                                ? { ...message, proposal: { ...message.proposal, status: 'stale' } }
                                : message)
                        }))
                    };
                });
            }
            toast.error(error.payload?.code === 'FORM_PROPOSAL_STALE'
                ? 'This suggestion is outdated. Generate a new one.'
                : error.message || 'Failed to apply changes.');
        } finally {
            setAcceptingProposalId(null);
        }
    }, [form, queryClient, queryKey, toast, rawMessages, updateProposalMutation]);

    const handleRejectProposal = useCallback((msgId) => {
        setRejectingProposalId(msgId);
        const msg = rawMessages.find(m => m.id === msgId);
        const originalProposal = msg?.proposal || {};
        
        updateProposalMutation.mutate({ msgId, originalProposal, status: 'rejected' }, {
            onSettled: () => setRejectingProposalId(null)
        });
    }, [updateProposalMutation, rawMessages]);

    return {
        messages: rawMessages,
        input,
        setInput,
        clarificationMode,
        setClarificationMode: updateClarificationMode,
        isTyping,
        isLoadingHistory: isLoadingHistory && rawMessages.length === 1 && rawMessages[0].id === 'init', // Only show main loader on first ever fetch
        hasMore: !!hasNextPage,
        loadMoreHistory: fetchNextPage,
        handleSend,
        handleAcceptProposal,
        handleRejectProposal,
        acceptingProposalId,
        rejectingProposalId,
        progressLabel
    };
};
