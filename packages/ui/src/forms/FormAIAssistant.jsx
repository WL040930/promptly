import React, { useRef, useEffect } from 'react';
import { useFormAIAssistant } from './hooks/useFormAIAssistant';
const SUGGESTIONS = [
    "A customer satisfaction survey",
    "An event registration form",
    "A job application form",
    "A product feedback questionnaire"
];

const FormAIAssistant = ({ form, onUpdateForm, accentColor = '#4f46e5' }) => {
    const {
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
    } = useFormAIAssistant(form, onUpdateForm);

    const scrollRef = useRef(null);

    // Auto-scroll to bottom of chat only when new messages are added at the bottom
    useEffect(() => {
        if (scrollRef.current && !isLoadingHistory) {
            // Very simple approach: if user is near bottom, keep them at bottom.
            // If they just loaded more history, we should ideally preserve scroll position, 
            // but for simplicity we just avoid forcing them to bottom if they are loading.
            const isNearBottom = scrollRef.current.scrollHeight - scrollRef.current.scrollTop <= scrollRef.current.clientHeight + 100;
            if (isNearBottom || isTyping) {
                scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
            }
        }
    }, [messages, isTyping, isLoadingHistory]);

    const handleScroll = () => {
        if (scrollRef.current && scrollRef.current.scrollTop === 0 && hasMore && !isLoadingHistory) {
            loadMoreHistory();
        }
    };

    return (
        <div className="flex flex-col h-full bg-white relative">
            {/* Chat Body */}
            <div 
                ref={scrollRef} 
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto p-4 flex flex-col gap-6"
            >
                {isLoadingHistory && (
                    <div className="text-center text-xs text-gray-400 py-2">
                        Loading messages...
                    </div>
                )}
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
                                    : msg.isError 
                                        ? 'bg-red-50 text-red-700 rounded-tl-none border border-red-200 shadow-sm'
                                        : 'bg-white text-slate-800 rounded-tl-none border border-slate-200/60 shadow-sm'
                            }`}>
                            {msg.text}
                        </div>

                        {/* Proposal Confirmation Box */}
                        {msg.proposal && (
                            <div className="mt-2 w-[90%] border border-slate-200 rounded-xl bg-slate-50 p-3 shadow-md flex flex-col gap-3">
                                <div className="flex items-center justify-between border-b border-slate-150 pb-2">
                                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Proposed Form Update</span>
                                    <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700">
                                        Schema
                                    </span>
                                </div>
                                
                                <div>
                                    <h4 className="text-sm font-semibold text-slate-800">{msg.proposal.schema?.title || "Form Update"}</h4>
                                    <p className="text-xs text-slate-500 mt-1 font-medium leading-relaxed">Adds {msg.proposal.schema?.fields?.length || 0} fields to your canvas.</p>
                                </div>

                                {msg.proposal.status === 'accepted' ? (
                                    <div className="flex items-center gap-1.5 justify-center py-1.5 px-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg text-xs font-semibold">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                        Added to Canvas
                                    </div>
                                ) : msg.proposal.status === 'rejected' ? (
                                    <div className="flex items-center gap-1.5 justify-center py-1.5 px-3 bg-red-50 border border-red-200 text-red-600 rounded-lg text-xs font-semibold">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                        Proposal Rejected
                                    </div>
                                ) : (
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => handleAcceptProposal(msg.id, msg.proposal.schema)}
                                            className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs py-2 rounded-lg shadow-sm hover:shadow active:scale-98 transition-all"
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
                <div className="px-4 py-2 flex flex-col gap-1.5 border-t border-slate-100 shrink-0">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Try asking:</span>
                    <div className="flex flex-wrap gap-1.5">
                        {SUGGESTIONS.map((s, idx) => (
                            <button
                                key={idx}
                                onClick={() => handleSend(s)}
                                className="text-left bg-slate-50 border border-slate-200 rounded-lg py-1.5 px-2.5 text-xs font-medium text-slate-600 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-600 transition-colors"
                            >
                                {s}
                            </button>
                        ))}
                    </div>
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
                        placeholder="Ask AI to build or modify form..."
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

export default FormAIAssistant;
