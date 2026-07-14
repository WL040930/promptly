import React, { useEffect, useRef, useState } from 'react';
import { sendChatMessage } from '../../../api/backend.js';
import Button from '../../../components/ui/Button.jsx';
import AgentMessage from '../../../components/chat/AgentMessage.jsx';

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
    const scrollRef = useRef(null);

    useEffect(() => {
        scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isTyping]);

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
            const response = await sendChatMessage(sessionId, text, { surface: 'builder', workflowId: workflow?.id || null, workflowSnapshot: snapshot, formId: formId || null }, event);
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
        <div className="flex flex-col h-full bg-white relative">
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-6">
                {messages.map(message => <AgentMessage key={message.id} message={message} onApply={handleApply} onIgnore={handleIgnore} onOption={handleOption} />)}
                {isTyping && <div className="text-xs font-semibold text-slate-400 px-10">{progressLabel}…</div>}
                <div ref={scrollRef} />
            </div>
            {messages.length === 1 && <div className="px-4 py-3 flex gap-2 overflow-x-auto border-t border-slate-100">{SUGGESTIONS.map(suggestion => <Button key={suggestion} variant="secondary" size="sm" onClick={() => send(suggestion)}>{suggestion}</Button>)}</div>}
            <div className="p-4 bg-white border-t border-slate-100 shrink-0">
                <form onSubmit={event => { event.preventDefault(); send(input); }} className="relative flex items-center w-full">
                    <input type="text" value={input} onChange={event => setInput(event.target.value)} placeholder="Type a workflow instruction…" className="w-full bg-slate-50 border border-slate-200 rounded-full pl-5 pr-14 py-3.5 text-sm focus:outline-none focus:ring-4 focus:ring-indigo-500/10" disabled={isTyping} autoFocus />
                    <button type="submit" disabled={!input.trim() || isTyping} className="absolute right-1.5 w-10 h-10 rounded-full bg-indigo-600 text-white disabled:bg-slate-100 disabled:text-slate-400 grid place-items-center">➤</button>
                </form>
                <div className="text-center mt-2 text-[10px] text-slate-400 font-semibold uppercase tracking-wider">AI can make mistakes. Please verify.</div>
            </div>
        </div>
    );
}
