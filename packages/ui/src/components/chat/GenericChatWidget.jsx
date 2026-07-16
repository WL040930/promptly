import React, { useRef, useEffect } from 'react';
import AgentMessage from './AgentMessage.jsx';
import ChatHistorySkeleton from './ChatHistorySkeleton.jsx';

export default function GenericChatWidget({
    messages = [],
    input,
    setInput,
    isTyping,
    isLoadingHistory,
    hasMore,
    loadMoreHistory,
    handleSend,
    handleApply,
    handleIgnore,
    handleOption,
    acceptingProposalId,
    rejectingProposalId,
    progressLabel = "Thinking",
    placeholder = "Type a message...",
    suggestions = [],
    bottomNotice = "AI can make mistakes. Please verify.",
    innerClassName = "w-full"
}) {
    const scrollContainerRef = useRef(null);
    const initialScrollDone = useRef(false);

    // Auto-scroll to bottom of chat
    useEffect(() => {
        if (isLoadingHistory || messages.length === 0) return;

        // Give React a tick to render the messages
        requestAnimationFrame(() => {
            const scrollContainer = scrollContainerRef.current;
            if (!scrollContainer) return;
            
            if (!initialScrollDone.current) {
                scrollContainer.scrollTo({ top: scrollContainer.scrollHeight, behavior: 'auto' });
                initialScrollDone.current = true;
            } else {
                // Only auto-scroll if near bottom or AI is typing
                const { scrollHeight, scrollTop, clientHeight } = scrollContainer;
                const isNearBottom = scrollHeight - scrollTop <= clientHeight + 150;
                
                if (isNearBottom || isTyping) {
                    scrollContainer.scrollTo({ top: scrollHeight, behavior: 'smooth' });
                }
            }
        });
    }, [messages, isTyping, isLoadingHistory]);

    const handleScroll = () => {
        if (scrollContainerRef.current && scrollContainerRef.current.scrollTop === 0 && hasMore && !isLoadingHistory) {
            loadMoreHistory?.();
        }
    };

    return (
        <div className="flex min-h-0 flex-1 flex-col w-full bg-transparent relative overflow-hidden">
            {/* Chat Body */}
            <div
                ref={scrollContainerRef}
                onScroll={handleScroll}
                className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-4 overscroll-contain"
            >
                <div className={`flex flex-col gap-6 ${innerClassName}`}>
                {isLoadingHistory ? (
                    <ChatHistorySkeleton />
                ) : (
                    messages.filter(msg => !['tool_call', 'tool_response'].includes(msg.kind)).map(message => (
                        <AgentMessage
                            key={message.id}
                            message={message}
                            onApply={handleApply}
                            onIgnore={handleIgnore}
                            onOption={handleOption}
                            isTyping={isTyping}
                            isAccepting={acceptingProposalId === message.id}
                            isRejecting={rejectingProposalId === message.id}
                        />
                    ))
                )}

                {isTyping && (
                    <div className="flex w-full justify-start">
                        <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 shrink-0 mt-4 mr-2.5 shadow-sm border border-indigo-200/50">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="14" x="3" y="8" rx="2"/><path d="M12 5a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"/><path d="M12 5v3"/><path d="M8 14h.01"/><path d="M16 14h.01"/><path d="M9 19h6"/></svg>
                        </div>
                        <div className="flex flex-col gap-1 items-start max-w-[85%]">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-1">
                                Promptly AI
                            </span>
                            <div className="bg-white border border-slate-200/60 rounded-2xl rounded-tl-none p-3.5 shadow-sm flex items-center gap-2 h-12">
                                <span className="flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce"></span>
                                    <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></span>
                                    <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></span>
                                </span>
                                {progressLabel && <span className="text-xs text-slate-500 font-medium ml-1">{progressLabel}…</span>}
                            </div>
                        </div>
                    </div>
                )}
                </div>

            </div>

            {/* Quick Suggestions */}
            {suggestions.length > 0 && messages.length === 1 && (
                <div className="px-4 py-2 flex flex-col gap-1.5 border-t border-slate-100 shrink-0">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Try asking:</span>
                    <div className="flex flex-wrap gap-1.5">
                        {suggestions.map((s, idx) => (
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
            <div className="p-4 bg-white/80 backdrop-blur-md border-t border-gray-200/60 shrink-0 shadow-[0_-4px_20px_-10px_rgba(0,0,0,0.05)] z-10 relative">
                <div className={innerClassName}>
                    <form
                        onSubmit={(e) => { e.preventDefault(); handleSend(input); }}
                        className="relative flex items-center w-full"
                    >
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder={placeholder}
                            className="w-full bg-white border border-slate-200 hover:border-slate-300 rounded-full pl-5 pr-14 py-3.5 text-[14px] text-slate-800 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-400 transition-all shadow-sm disabled:opacity-60 font-medium placeholder:text-gray-400"
                            disabled={isTyping}
                            autoFocus
                        />
                        <button
                            type="submit"
                            disabled={!input.trim() || isTyping}
                            className={`absolute right-1.5 w-10 h-10 p-0 rounded-full flex items-center justify-center transition-all ${input.trim() && !isTyping
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
                    {bottomNotice && (
                        <div className="text-center mt-2.5">
                            <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">{bottomNotice}</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
