import { useState, useCallback, useMemo } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { generateFormFromPrompt, getFormChatHistory, addFormChatMessage, updateFormChatMessage } from '../../api/backend.js';
import { useToast } from '../../context/ToastContext.jsx';

const LIMIT = 50;
const defaultMessage = {
    id: 'init',
    sender: 'bot',
    text: "Hi! I'm your AI form designer. Describe what kind of form you want to build, or ask me to add specific fields.",
};

export const useFormAIAssistant = (form, onUpdateForm) => {
    const queryClient = useQueryClient();
    const toast = useToast();
    const [input, setInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [acceptingProposalId, setAcceptingProposalId] = useState(null);
    const [rejectingProposalId, setRejectingProposalId] = useState(null);

    const queryKey = ['formChat', form?.id];

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
        mutationFn: async (text) => {
            // Save user message to DB
            const savedUserMsg = await addFormChatMessage(form.id, { sender: 'user', text });
            
            // Generate AI response
            const result = await generateFormFromPrompt(text, form, form.id);
            
            // Save bot message to DB
            let botMsgData = { sender: 'bot', text: result.message };

            if (result.type === 'proposal') {
                botMsgData.proposal = {
                    schema: result.schema,
                    patches: result.patches,
                    status: 'pending' 
                };
            } else if (result.type === 'message' && result.options) {
                botMsgData.options = result.options;
            }

            if (result.tokenUsage) {
                botMsgData.tokenUsage = result.tokenUsage;
            }

            const savedBotMsg = await addFormChatMessage(form.id, botMsgData);
            return { userMsg: savedUserMsg, botMsg: savedBotMsg };
        },
        onMutate: async (text) => {
            setIsTyping(true);
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
        onError: (err, variables, context) => {
            setIsTyping(false);
            if (context?.previousData) {
                queryClient.setQueryData(queryKey, context.previousData);
            }
            
            // Show error message
            toast.error('Failed to generate form with AI.');
            queryClient.setQueryData(queryKey, (old) => {
                if (!old) return old;
                const newPages = [...old.pages];
                newPages[0] = {
                    ...newPages[0],
                    messages: [...newPages[0].messages, {
                        id: Date.now().toString(),
                        sender: 'bot',
                        text: "Sorry, I encountered an error while generating the form. Please try again.",
                        isError: true
                    }]
                };
                return { ...old, pages: newPages };
            });
        },
        onSuccess: (data, variables, context) => {
            setIsTyping(false);
            // Replace optimistic user message with actual, and append bot message
            queryClient.setQueryData(queryKey, (old) => {
                if (!old) return old;
                const newPages = [...old.pages];
                let currentMessages = newPages[0].messages.filter(m => m.id !== context.optimisticUserId);
                newPages[0] = {
                    ...newPages[0],
                    messages: [...currentMessages, data.userMsg, data.botMsg]
                };
                return { ...old, pages: newPages };
            });
        }
    });

    const updateProposalMutation = useMutation({
        mutationFn: async ({ msgId, status, schema }) => {
            const updates = { proposal: { status } };
            if (schema) updates.proposal.schema = schema;
            await updateFormChatMessage(msgId, updates);
            return { msgId, status };
        },
        onMutate: async ({ msgId, status }) => {
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
                            msg.id === msgId ? { ...msg, proposal: { ...msg.proposal, status } } : msg
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
        }
    });

    const handleSend = useCallback((text) => {
        if (!text.trim() || isTyping || !form?.id) return;
        sendMessageMutation.mutate(text);
    }, [form?.id, isTyping, sendMessageMutation]);

    const handleAcceptProposal = useCallback(async (msgId, proposalSchema) => {
        setAcceptingProposalId(msgId);
        try {
            // Ensure all fields have an ID
            const sanitizedFields = (proposalSchema.fields || []).map(field => {
                if (!field.id) {
                    return { ...field, id: `f_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` };
                }
                return field;
            });

            await onUpdateForm({
                title: proposalSchema.title,
                description: proposalSchema.description,
                fields: sanitizedFields
            });

            updateProposalMutation.mutate({ msgId, status: 'accepted', schema: proposalSchema });
            toast.success('Form updated successfully!');
        } catch (error) {
            console.error('Error applying proposal:', error);
            toast.error('Failed to apply changes.');
        } finally {
            setAcceptingProposalId(null);
        }
    }, [onUpdateForm, updateProposalMutation, toast]);

    const handleRejectProposal = useCallback((msgId) => {
        setRejectingProposalId(msgId);
        updateProposalMutation.mutate({ msgId, status: 'rejected' }, {
            onSettled: () => setRejectingProposalId(null)
        });
    }, [updateProposalMutation]);

    return {
        messages: rawMessages,
        input,
        setInput,
        isTyping,
        isLoadingHistory: isLoadingHistory && rawMessages.length === 1 && rawMessages[0].id === 'init', // Only show main loader on first ever fetch
        hasMore: !!hasNextPage,
        loadMoreHistory: fetchNextPage,
        handleSend,
        handleAcceptProposal,
        handleRejectProposal,
        acceptingProposalId,
        rejectingProposalId
    };
};
