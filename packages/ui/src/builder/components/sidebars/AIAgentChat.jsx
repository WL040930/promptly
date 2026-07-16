import React, { useState } from 'react';
import { useSendChatMessage } from '../../../api/hooks/useChat.js';
import GenericChatWidget from '../../../components/chat/GenericChatWidget.jsx';

const SUGGESTIONS = ['Add a Slack notification step', 'Filter for high urgency tickets', 'Add GPT response step to emails', 'Store results in database'];

const initialMessage = {
    id: 'init',
    sender: 'bot',
    kind: 'text',
    text: "Hi! I'm your Promptly Agent. I can help you build and configure this workflow. What would you like to automate or modify?"
};

export default function AIAgentChat({ workflow, formId, onApplyProposal }) {
    const [messages, setMessages] = useState([initialMessage]);
    const [input, setInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [progressLabel, setProgressLabel] = useState('Scanning node library');
    const [sessionId, setSessionId] = useState(null);
    const sendChatMessageMutation = useSendChatMessage();

    const appendReply = (response) => {
        if (response?.reply) setMessages(previous => [...previous, response.reply]);
        if (response?.sessionId) setSessionId(response.sessionId);
    };

    const send = async (text, event = null) => {
        if (!text?.trim() && !event) return;
        if (text?.trim()) setMessages(previous => [...previous, { id: `local_${Date.now()}`, sender: 'user', kind: 'text', text }]);
        setInput('');
        if (text && /form/i.test(text)) setProgressLabel('Designing form');
        else if (text && workflow?.nodes?.length && /\b(add|remove|change|modify|update|insert|delete|edit)\b/i.test(text)) setProgressLabel('Analysing current workflow');
        else setProgressLabel(workflow?.nodes?.length ? 'Analysing current workflow' : 'Scanning node library');
        setIsTyping(true);
        try {
            const snapshot = workflow ? {
                nodes: (workflow.nodes || []).map(node => ({ id: node.id, title: node.title, type: node.type, subType: node.subType })),
                edges: (workflow.edges || []).map(edge => ({ id: edge.id, source: edge.source, target: edge.target, sourceHandle: edge.sourceHandle || null, targetHandle: edge.targetHandle || null }))
            } : null;
            const response = await sendChatMessageMutation.mutateAsync({
                sessionId,
                message: text,
                context: { surface: 'builder', workflowId: workflow?.id || null, workflowSnapshot: snapshot, formId: formId || null },
                event
            });
            appendReply(response);
        } catch (error) {
            setMessages(previous => [...previous, { id: `error_${Date.now()}`, sender: 'bot', kind: 'error', text: error.message || 'Sorry, I could not process that request.' }]);
        } finally {
            setIsTyping(false);
        }
    };

    const handleApply = async (message) => {
        try {
            const result = await onApplyProposal?.(message);
            setMessages(previous => previous.map(item => item.id === message.id ? { ...item, proposalStatus: 'applied' } : item));
            if (message.kind === 'form_proposal') {
                await send(null, { type: 'form_saved', messageId: message.id, formId: result?.formId || result });
            } else {
                await send(null, { type: 'proposal_applied', messageId: message.id });
            }
        } catch (error) {
            setMessages(previous => [...previous, { id: `error_${Date.now()}`, sender: 'bot', kind: 'error', text: error.message || 'The proposal could not be applied.' }]);
        }
    };

    const handleIgnore = (message) => {
        setMessages(previous => previous.map(item => item.id === message.id ? { ...item, proposalStatus: 'ignored' } : item));
        send(null, { type: 'proposal_ignored', messageId: message.id });
    };

    const handleOption = (option) => {
        if (option?.id && option?.title) return send(null, { type: 'form_target_selected', formId: option.id });
        if (option?.id && option?.name) return send(null, { type: 'workflow_target_selected', workflowId: option.id });
        return send(typeof option === 'string' ? option : option?.label || option?.name || option?.title);
    };

    return (
        <div className="flex min-h-0 flex-col h-full bg-white relative overflow-hidden">
            <GenericChatWidget 
                messages={messages}
                input={input}
                setInput={setInput}
                isTyping={isTyping}
                handleSend={send}
                handleApply={handleApply}
                handleIgnore={handleIgnore}
                handleOption={handleOption}
                progressLabel={progressLabel}
                placeholder="Type a workflow instruction…"
                suggestions={SUGGESTIONS}
                bottomNotice="AI can make mistakes. Please verify."
            />
        </div>
    );
}
