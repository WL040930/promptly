import React, { useState, useRef, useEffect } from 'react';
import { sendChatMessage } from '../../../api/backend.js';
import Button from '../../../components/Button.jsx';

const SUGGESTIONS = [
    "Add a Slack notification step",
    "Filter for high urgency tickets",
    "Add GPT response step to emails",
    "Store results in database"
];

const AIAgentChat = ({ onApplyAction }) => {
    const [messages, setMessages] = useState([
        {
            id: 'init',
            sender: 'bot',
            text: "Hi! I'm your Promptly Agent. I can help you build and configure this workflow. What would you like to automate or modify?",
        }
    ]);
    const [input, setInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [sessionId, setSessionId] = useState(null);
    const scrollRef = useRef(null);

    useEffect(() => {
        scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isTyping]);

    const handleSend = async (text) => {
        if (!text.trim()) return;

        // Add user message
        const newMsgId = Date.now().toString();
        setMessages(prev => [...prev, { id: newMsgId, sender: 'user', text }]);
        setInput('');
        setIsTyping(true);

        try {
            const botResponse = await sendChatMessage(sessionId, text);
            if (botResponse.sessionId && !sessionId) {
                setSessionId(botResponse.sessionId);
            }
            setIsTyping(false);

            let botReply = {
                id: Date.now().toString(),
                sender: 'bot',
                text: botResponse.reply?.text || botResponse.message || 'I have processed your request.'
            };

            if (botResponse.reply?.proposal) {
                botReply.proposal = botResponse.reply.proposal;
            } else if (botResponse.proposal) {
                botReply.proposal = botResponse.proposal;
            }

            setMessages(prev => [...prev, botReply]);
        } catch (err) {
            console.error("Chat error:", err);
            setIsTyping(false);
            setMessages(prev => [...prev, {
                id: Date.now().toString(),
                sender: 'bot',
                text: "Sorry, I encountered an error communicating with the agent. Please try again."
            }]);
        }
    };

    const handleAcceptProposal = (msgId, proposal) => {
        // Callback to parent to update canvas
        onApplyAction?.(proposal);

        // Update message state to show accepted
        setMessages(prev => prev.map(m => {
            if (m.id === msgId) {
                return {
                    ...m,
                    proposal: { ...m.proposal, status: 'accepted' }
                };
            }
            return m;
        }));
    };

    const handleRejectProposal = (msgId) => {
        // Update message state to show rejected
        setMessages(prev => prev.map(m => {
            if (m.id === msgId) {
                return {
                    ...m,
                    proposal: { ...m.proposal, status: 'rejected' }
                };
            }
            return m;
        }));
    };

    return (
        <div className="flex flex-col h-full bg-white relative">
            {/* Chat Body */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-6">
                {messages.map((msg) => (
                    <div key={msg.id} className={`flex w-full ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                        {/* Bot Avatar */}
                        {msg.sender === 'bot' && (
                            <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 shrink-0 mt-4 mr-2.5 shadow-sm border border-indigo-200/50">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="m12 3-1.9 5.8a2 2 0 0 1-1.29 1.29L3 12l5.8 1.9a2 2 0 0 1 1.29 1.29L12 21l1.9-5.8a2 2 0 0 1 1.29-1.29L21 12l-5.8-1.9a2 2 0 0 1-1.29-1.29L12 3Z"></path>
                                </svg>
                            </div>
                        )}
                        
                        <div className={`flex flex-col gap-1 ${msg.sender === 'user' ? 'items-end' : 'items-start'} max-w-[85%]`}>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-1">
                                {msg.sender === 'user' ? 'You' : 'AI Assistant'}
                            </span>
                            
                            <div className={`w-full rounded-2xl p-3.5 text-sm leading-relaxed ${
                                msg.sender === 'user'
                                    ? 'bg-indigo-600 text-white font-medium rounded-tr-none shadow-sm'
                                    : 'bg-white text-slate-800 rounded-tl-none border border-slate-200/60 shadow-sm'
                            }`}>
                                {msg.text}
                            </div>

                            {/* Proposal Confirmation Box */}
                            {msg.proposal && (
                                <div className="mt-2 w-full border border-slate-200 rounded-xl bg-slate-50 p-3 shadow-sm flex flex-col gap-3">
                                    <div className="flex items-center justify-between border-b border-slate-150 pb-2">
                                        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Proposed Node</span>
                                        <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${
                                            msg.proposal.type === 'trigger' ? 'bg-indigo-100 text-indigo-700' :
                                            msg.proposal.type === 'ai' ? 'bg-indigo-100 text-indigo-700' : 'bg-indigo-100 text-indigo-700'
                                        }`}>
                                            {msg.proposal.type}
                                        </span>
                                    </div>
                                    
                                    <div>
                                        <h4 className="text-sm font-semibold text-slate-800">{msg.proposal.title}</h4>
                                        <p className="text-xs text-slate-500 mt-1 font-medium leading-relaxed">{msg.proposal.description}</p>
                                    </div>

                                    {msg.proposal.status === 'accepted' ? (
                                        <div className="flex items-center gap-1.5 justify-center py-2 px-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg text-xs font-semibold">
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                            Added to Canvas
                                        </div>
                                    ) : msg.proposal.status === 'rejected' ? (
                                        <div className="flex items-center gap-1.5 justify-center py-2 px-3 bg-red-50 border border-red-100 text-red-600 rounded-lg text-xs font-semibold">
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                            Proposal Rejected
                                        </div>
                                    ) : (
                                        <div className="flex gap-2">
                                            <Button
                                                variant="primary"
                                                size="sm"
                                                onClick={() => handleAcceptProposal(msg.id, msg.proposal)}
                                                className="flex-1 py-2 text-xs"
                                            >
                                                Accept & Add
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => handleRejectProposal(msg.id)}
                                                className="flex-1 py-2 text-xs"
                                            >
                                                Ignore
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                ))}

                {isTyping && (
                    <div className="flex w-full justify-start">
                        <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 shrink-0 mt-4 mr-2.5 shadow-sm border border-indigo-200/50">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="m12 3-1.9 5.8a2 2 0 0 1-1.29 1.29L3 12l5.8 1.9a2 2 0 0 1 1.29 1.29L12 21l1.9-5.8a2 2 0 0 1 1.29-1.29L21 12l-5.8-1.9a2 2 0 0 1-1.29-1.29L12 3Z"></path>
                            </svg>
                        </div>
                        <div className="flex flex-col gap-1 items-start max-w-[85%]">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-1">
                                AI Assistant
                            </span>
                            <div className="bg-white border border-slate-200/60 rounded-2xl rounded-tl-none p-3.5 shadow-sm flex items-center gap-1.5 h-12">
                                <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce"></span>
                                <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></span>
                                <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></span>
                            </div>
                        </div>
                    </div>
                )}
                
                <div ref={scrollRef} />
            </div>

            {/* Quick Suggestions */}
            {messages.length === 1 && (
                <div className="px-4 py-3 flex gap-2 overflow-x-auto scrollbar-hide no-scrollbar w-full border-t border-slate-100 shrink-0">
                    {SUGGESTIONS.map((suggestion, idx) => (
                        <Button
                            key={idx}
                            variant="secondary"
                            size="sm"
                            onClick={() => handleSend(suggestion)}
                            disabled={isTyping}
                            className="whitespace-nowrap rounded-full text-[12px] px-3.5 py-1.5 font-semibold"
                        >
                            {suggestion}
                        </Button>
                    ))}
                </div>
            )}

            {/* Input Box */}
            <div className="p-4 bg-white border-t border-slate-100 shrink-0 shadow-[0_-4px_20px_-10px_rgba(0,0,0,0.05)] z-10 relative">
                <form 
                    onSubmit={(e) => { e.preventDefault(); handleSend(input); }}
                    className="relative flex items-center w-full"
                >
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Type a workflow instruction..."
                        className="w-full bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-full pl-5 pr-14 py-3.5 text-sm text-slate-800 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-400 transition-all shadow-sm disabled:opacity-60"
                        disabled={isTyping}
                        autoFocus
                    />
                    <button
                        type="submit"
                        disabled={!input.trim() || isTyping}
                        className={`absolute right-1.5 w-10 h-10 rounded-full grid place-items-center transition-all ${
                            input.trim() && !isTyping
                                ? 'bg-indigo-600 text-white shadow-md hover:bg-indigo-700 hover:scale-105 active:scale-95'
                                : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                        }`}
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="22" y1="2" x2="11" y2="13" />
                            <polygon points="22 2 15 22 11 13 2 9 22 2" />
                        </svg>
                    </button>
                </form>
                <div className="text-center mt-2.5">
                    <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">AI can make mistakes. Please verify.</span>
                </div>
            </div>
        </div>
    );
};

export default AIAgentChat;
