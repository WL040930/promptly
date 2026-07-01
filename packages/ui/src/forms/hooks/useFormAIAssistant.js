import { useState } from 'react';
import { generateFormFromPrompt } from '../../api/backend.js';
import { useToast } from '../../components/ToastContext.jsx';

export const useFormAIAssistant = (form, onUpdateForm) => {
    const [messages, setMessages] = useState([
        {
            id: 'init',
            sender: 'bot',
            text: "Hi! I'm your AI form designer. Describe what kind of form you want to build, or ask me to add specific fields.",
        }
    ]);
    const [input, setInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const toast = useToast();

    const handleSend = async (text) => {
        if (!text.trim() || isTyping) return;

        // Add user message
        const newMsgId = Date.now().toString();
        setMessages(prev => [...prev, { id: newMsgId, sender: 'user', text }]);
        setInput('');
        setIsTyping(true);

        try {
            // Call the existing backend generation endpoint, passing the current form schema
            const schema = await generateFormFromPrompt(text, form);
            
            // Add bot reply with a proposal
            setMessages(prev => [...prev, {
                id: Date.now().toString(),
                sender: 'bot',
                text: "I've drafted a form schema based on your request. Review it below and click 'Accept & Add' to apply it to your canvas.",
                proposal: {
                    schema: schema,
                    status: 'pending' // pending, accepted, rejected
                }
            }]);

        } catch (error) {
            console.error('AI Generation Error:', error);
            setMessages(prev => [...prev, {
                id: Date.now().toString(),
                sender: 'bot',
                text: "Sorry, I encountered an error while generating the form. Please try again.",
                isError: true
            }]);
            toast.error('Failed to generate form with AI.');
        } finally {
            setIsTyping(false);
        }
    };

    const handleAcceptProposal = async (msgId, proposalSchema) => {
        try {
            // Ensure all fields have an ID (in case the AI forgot to generate one)
            const sanitizedFields = (proposalSchema.fields || []).map(field => {
                if (!field.id) {
                    return { ...field, id: `f_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` };
                }
                return field;
            });

            // The AI now returns the fully updated form schema (title, description, fields).
            // We just replace the current fields completely.
            await onUpdateForm({
                title: proposalSchema.title,
                description: proposalSchema.description,
                fields: sanitizedFields
            });

            // Mark proposal as accepted
            setMessages(prev => prev.map(msg => 
                msg.id === msgId ? { ...msg, proposal: { ...msg.proposal, status: 'accepted' } } : msg
            ));

            toast.success('Form updated successfully!');
        } catch (error) {
            console.error('Error applying proposal:', error);
            toast.error('Failed to apply changes.');
        }
    };

    const handleRejectProposal = (msgId) => {
        setMessages(prev => prev.map(msg => 
            msg.id === msgId ? { ...msg, proposal: { ...msg.proposal, status: 'rejected' } } : msg
        ));
    };

    return {
        messages,
        input,
        setInput,
        isTyping,
        handleSend,
        handleAcceptProposal,
        handleRejectProposal
    };
};
