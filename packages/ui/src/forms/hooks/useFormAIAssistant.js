import { useState, useEffect, useCallback } from 'react';
import { generateFormFromPrompt, getFormChatHistory, addFormChatMessage, updateFormChatMessage } from '../../api/backend.js';
import { useToast } from '../../components/ToastContext.jsx';

export const useFormAIAssistant = (form, onUpdateForm) => {
    const defaultMessage = {
        id: 'init',
        sender: 'bot',
        text: "Hi! I'm your AI form designer. Describe what kind of form you want to build, or ask me to add specific fields.",
    };

    const [messages, setMessages] = useState([defaultMessage]);
    const [input, setInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);
    const [offset, setOffset] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const limit = 50;
    const toast = useToast();

    // Fetch history when form changes
    useEffect(() => {
        if (!form?.id) return;
        
        let isMounted = true;
        const loadInitialHistory = async () => {
            setIsLoadingHistory(true);
            try {
                const history = await getFormChatHistory(form.id, limit, 0);
                if (isMounted) {
                    if (history && history.length > 0) {
                        setMessages(history);
                        if (history.length < limit) {
                            setHasMore(false);
                        }
                    } else {
                        setMessages([defaultMessage]);
                        setHasMore(false);
                    }
                    setOffset(history.length || 0);
                }
            } catch (error) {
                console.error("Failed to load chat history:", error);
                if (isMounted) {
                    setMessages([defaultMessage]);
                    toast.error("Failed to load chat history");
                }
            } finally {
                if (isMounted) setIsLoadingHistory(false);
            }
        };

        loadInitialHistory();

        return () => { isMounted = false; };
    }, [form?.id]);

    const loadMoreHistory = useCallback(async () => {
        if (!form?.id || !hasMore || isLoadingHistory) return;
        
        setIsLoadingHistory(true);
        try {
            const history = await getFormChatHistory(form.id, limit, offset);
            if (history && history.length > 0) {
                setMessages(prev => [...history, ...prev]);
                setOffset(prev => prev + history.length);
                if (history.length < limit) {
                    setHasMore(false);
                }
            } else {
                setHasMore(false);
            }
        } catch (error) {
            console.error("Failed to load older messages:", error);
            toast.error("Failed to load older messages");
        } finally {
            setIsLoadingHistory(false);
        }
    }, [form?.id, hasMore, isLoadingHistory, offset]);


    const handleSend = async (text) => {
        if (!text.trim() || isTyping || !form?.id) return;

        setIsTyping(true);
        
        // Optimistic UI update for user message
        const optimisticUserId = Date.now().toString();
        setMessages(prev => [...prev, { id: optimisticUserId, sender: 'user', text }]);
        setInput('');

        try {
            // Save user message to DB
            const savedUserMsg = await addFormChatMessage(form.id, { sender: 'user', text });
            
            // Replace optimistic ID with real DB ID
            setMessages(prev => prev.map(m => m.id === optimisticUserId ? savedUserMsg : m));

            // Generate AI response
            const schema = await generateFormFromPrompt(text, form);
            
            // Save bot message to DB
            const botMsgData = {
                sender: 'bot',
                text: "I've drafted a form schema based on your request. Review it below and click 'Accept & Add' to apply it to your canvas.",
                proposal: {
                    schema: schema,
                    status: 'pending' 
                }
            };
            const savedBotMsg = await addFormChatMessage(form.id, botMsgData);
            
            // Add bot message to UI
            setMessages(prev => [...prev, savedBotMsg]);

        } catch (error) {
            console.error('AI Generation Error:', error);
            
            // Save error message to DB
            const errorMsgData = {
                sender: 'bot',
                text: "Sorry, I encountered an error while generating the form. Please try again.",
                isError: true
            };
            
            try {
                const savedErrorMsg = await addFormChatMessage(form.id, errorMsgData);
                setMessages(prev => [...prev, savedErrorMsg]);
            } catch (dbErr) {
                 // Fallback if DB save also fails
                 setMessages(prev => [...prev, { id: Date.now().toString(), ...errorMsgData }]);
            }

            toast.error('Failed to generate form with AI.');
        } finally {
            setIsTyping(false);
        }
    };

    const handleAcceptProposal = async (msgId, proposalSchema) => {
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

            // Update in DB
            const updatedProposal = { ...proposalSchema, status: 'accepted' };
            await updateFormChatMessage(msgId, { proposal: { schema: proposalSchema, status: 'accepted' }});

            // Update in UI
            setMessages(prev => prev.map(msg => 
                msg.id === msgId ? { ...msg, proposal: { ...msg.proposal, status: 'accepted' } } : msg
            ));

            toast.success('Form updated successfully!');
        } catch (error) {
            console.error('Error applying proposal:', error);
            toast.error('Failed to apply changes.');
        }
    };

    const handleRejectProposal = async (msgId) => {
         try {
            const message = messages.find(m => m.id === msgId);
            if (message && message.proposal) {
                 await updateFormChatMessage(msgId, { proposal: { ...message.proposal, status: 'rejected' }});
            }
             
            setMessages(prev => prev.map(msg => 
                msg.id === msgId ? { ...msg, proposal: { ...msg.proposal, status: 'rejected' } } : msg
            ));
         } catch (error) {
            console.error('Error rejecting proposal:', error);
            toast.error('Failed to reject proposal.');
         }
    };

    return {
        messages,
        input,
        setInput,
        isTyping,
        isLoadingHistory,
        hasMore,
        loadMoreHistory,
        handleSend,
        handleAcceptProposal,
        handleRejectProposal
    };
};
