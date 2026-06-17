import React, { useState, useRef, useEffect } from 'react';

const SUGGESTIONS = [
    "Add a Slack notification step",
    "Filter for high urgency tickets",
    "Add GPT response step to emails",
    "Store results in database"
];

const AICopilotChat = ({ onApplyAction }) => {
    const [messages, setMessages] = useState([
        {
            id: 'init',
            sender: 'bot',
            text: "Hi! I'm your Promptly Agent. I can help you build and configure this workflow. What would you like to automate or modify?",
        }
    ]);
    const [input, setInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const scrollRef = useRef(null);

    useEffect(() => {
        scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isTyping]);

    const handleSend = (text) => {
        if (!text.trim()) return;

        // Add user message
        const newMsgId = Date.now().toString();
        setMessages(prev => [...prev, { id: newMsgId, sender: 'user', text }]);
        setInput('');
        setIsTyping(true);

        // Simulate AI response with a delay
        setTimeout(() => {
            setIsTyping(false);
            const lowerText = text.toLowerCase();
            let botReply = {};

            if (lowerText.includes('slack') || lowerText.includes('notification')) {
                botReply = {
                    id: Date.now().toString(),
                    sender: 'bot',
                    text: "I've drafted a Slack notification action node for you. Would you like to add it to your canvas?",
                    proposal: {
                        type: 'action',
                        title: 'Slack Notification',
                        description: 'Posts a message to the #support channel with ticket details.'
                    }
                };
            } else if (lowerText.includes('filter') || lowerText.includes('urgency') || lowerText.includes('condition')) {
                botReply = {
                    id: Date.now().toString(),
                    sender: 'bot',
                    text: "I can insert a conditional routing step to classify urgency levels. Does this structure look good?",
                    proposal: {
                        type: 'ai',
                        title: 'Filter Urgency',
                        description: 'Filters the workflow path to execute only if urgency is "high".'
                    }
                };
            } else if (lowerText.includes('gpt') || lowerText.includes('email') || lowerText.includes('summarize')) {
                botReply = {
                    id: Date.now().toString(),
                    sender: 'bot',
                    text: "I've generated an AI step using GPT to draft response drafts. Let's preview this before inserting:",
                    proposal: {
                        type: 'ai',
                        title: 'Draft Support Response',
                        description: 'Uses LLM to write a personalized reply based on intent and company docs.'
                    }
                };
            } else if (lowerText.includes('database') || lowerText.includes('postgres') || lowerText.includes('store')) {
                botReply = {
                    id: Date.now().toString(),
                    sender: 'bot',
                    text: "I can append a database action node to log the transaction. Let me know if you approve this:",
                    proposal: {
                        type: 'action',
                        title: 'Insert DB Record',
                        description: 'Inserts ticket_id, sentiment_score, and customer_email into support_logs.'
                    }
                };
            } else {
                botReply = {
                    id: Date.now().toString(),
                    sender: 'bot',
                    text: "I understand. I can generate a node for that. Here is a proposed step to add to the workflow:",
                    proposal: {
                        type: 'ai',
                        title: text.length > 25 ? text.substring(0, 25) + '...' : text,
                        description: `Custom action node configured for: "${text}"`
                    }
                };
            }

            setMessages(prev => [...prev, botReply]);
        }, 1200);
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
            {/* Header */}
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0">
                <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 bg-blue-500 rounded-full animate-pulse"></div>
                    <h3 className="font-semibold text-slate-800 text-sm">Promptly Agent</h3>
                </div>
            </div>

            {/* Chat Body */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
                {messages.map((msg) => (
                    <div key={msg.id} className={`flex flex-col gap-1 ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}>
                        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-1">
                            {msg.sender === 'user' ? 'You' : 'Promptly Agent'}
                        </span>
                        
                        <div className={`max-w-[90%] rounded-2xl p-3 text-sm leading-relaxed ${
                            msg.sender === 'user'
                                ? 'bg-blue-600 text-white font-medium rounded-tr-none shadow-sm'
                                : 'bg-slate-100 text-slate-800 rounded-tl-none border border-slate-200/50 shadow-sm'
                        }`}>
                            {msg.text}
                        </div>

                        {/* Proposal Confirmation Box */}
                        {msg.proposal && (
                            <div className="mt-2 w-[90%] border border-slate-200 rounded-xl bg-slate-50 p-3 shadow-md flex flex-col gap-3">
                                <div className="flex items-center justify-between border-b border-slate-150 pb-2">
                                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Proposed Node</span>
                                    <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${
                                        msg.proposal.type === 'trigger' ? 'bg-indigo-100 text-indigo-700' :
                                        msg.proposal.type === 'ai' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                                    }`}>
                                        {msg.proposal.type}
                                    </span>
                                </div>
                                
                                <div>
                                    <h4 className="text-sm font-semibold text-slate-800">{msg.proposal.title}</h4>
                                    <p className="text-xs text-slate-500 mt-1 font-medium leading-relaxed">{msg.proposal.description}</p>
                                </div>

                                {msg.proposal.status === 'accepted' ? (
                                    <div className="flex items-center gap-1.5 justify-center py-1.5 px-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg text-xs font-semibold">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                        Added to Canvas
                                    </div>
                                ) : msg.proposal.status === 'rejected' ? (
                                    <div className="flex items-center gap-1.5 justify-center py-1.5 px-3 bg-red-50 border border-red-255 text-red-600 rounded-lg text-xs font-semibold">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                        Proposal Rejected
                                    </div>
                                ) : (
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => handleAcceptProposal(msg.id, msg.proposal)}
                                            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs py-2 rounded-lg shadow-sm hover:shadow active:scale-98 transition-all"
                                        >
                                            Accept & Add
                                        </button>
                                        <button
                                            onClick={() => handleRejectProposal(msg.id)}
                                            className="flex-1 bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 font-semibold text-xs py-2 rounded-lg transition-all"
                                        >
                                            Ignore
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                ))}

                {isTyping && (
                    <div className="flex items-center gap-2 text-slate-400">
                        <span className="text-xs font-medium text-slate-500">AI is drafting</span>
                        <div className="flex gap-1">
                            <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"></span>
                            <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></span>
                            <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></span>
                        </div>
                    </div>
                )}
                
                <div ref={scrollRef} />
            </div>

            {/* Quick Suggestions */}
            {messages.length === 1 && (
                <div className="px-4 py-2 flex flex-col gap-1.5 border-t border-slate-100 shrink-0">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Try asking:</span>
                    <div className="flex flex-wrap gap-1.5">
                        {SUGGESTIONS.map((s, idx) => (
                            <button
                                key={idx}
                                onClick={() => handleSend(s)}
                                className="text-left bg-slate-50 border border-slate-200 rounded-lg py-1.5 px-2.5 text-xs font-medium text-slate-600 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-600 transition-colors"
                            >
                                {s}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Input Box */}
            <div className="p-3 border-t border-slate-150 bg-white shrink-0">
                <form
                    onSubmit={(e) => { e.preventDefault(); handleSend(input); }}
                    className="flex gap-2 bg-slate-50 border border-slate-200 rounded-xl p-1.5 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-500/10 transition-all"
                >
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Type a workflow instruction..."
                        className="flex-1 bg-transparent border-none outline-none text-slate-800 placeholder:text-slate-400 text-sm px-2.5 py-1.5 font-medium"
                    />
                    <button
                        type="submit"
                        disabled={!input.trim() || isTyping}
                        className={`w-8 h-8 rounded-lg grid place-items-center transition-all ${
                            input.trim() && !isTyping
                                ? 'bg-blue-600 text-white shadow hover:bg-blue-700'
                                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                        }`}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                    </button>
                </form>
            </div>
        </div>
    );
};

export default AICopilotChat;
