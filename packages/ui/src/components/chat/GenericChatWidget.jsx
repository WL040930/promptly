import { useRef, useEffect, useState } from 'react';
import { ArrowUp, LoaderCircle, Trash2 } from 'lucide-react';
import AgentMessage from './AgentMessage.jsx';
import ChatHistorySkeleton from './ChatHistorySkeleton.jsx';
import ConfirmModal from '../modals/ConfirmModal.jsx';

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
    innerClassName = "w-full",
    composerClassName = innerClassName,
    inputAccessory = null,
    onClearChat = null,
    isClearingChat = false,
    clearChatLabel = 'Clear chat'
}) {
    const scrollContainerRef = useRef(null);
    const inputRef = useRef(null);
    const initialScrollDone = useRef(false);
    const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);

    const handleInputChange = (event) => {
        setInput(event.target.value);
        const inputElement = inputRef.current;
        if (!inputElement) return;
        inputElement.style.height = 'auto';
        inputElement.style.height = `${Math.min(inputElement.scrollHeight, 144)}px`;
    };

    const handleInputKeyDown = (event) => {
        if (event.key !== 'Enter' || event.shiftKey) return;
        event.preventDefault();
        if (input?.trim() && !isTyping) handleSend(input);
    };

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

    useEffect(() => {
        if (inputRef.current && !input) inputRef.current.style.height = 'auto';
    }, [input]);

    const handleScroll = () => {
        if (scrollContainerRef.current && scrollContainerRef.current.scrollTop === 0 && hasMore && !isLoadingHistory) {
            loadMoreHistory?.();
        }
    };

    const handleClearChat = () => {
        if (!onClearChat || isClearingChat) return;
        setIsClearConfirmOpen(true);
    };

    const confirmClearChat = async () => {
        if (!onClearChat || isClearingChat) return;
        try {
            await onClearChat();
            setIsClearConfirmOpen(false);
        } catch {
            // The assistant hook owns the error toast; keep the modal open so
            // the user can retry without losing their place in the chat.
        }
    };

    return (
        <div className="flex min-h-0 flex-1 flex-col w-full bg-transparent relative overflow-hidden">
            {onClearChat && (
                <div className="flex shrink-0 items-center justify-between border-b border-slate-200/70 bg-white/90 px-4 py-2.5">
                    <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Assistant chat</span>
                    <div className="flex items-center gap-1">
                        {isTyping && <LoaderCircle size={15} className="mr-1 animate-spin text-indigo-500" aria-label="AI is working" />}
                        <button
                            type="button"
                            onClick={handleClearChat}
                            disabled={isClearingChat}
                            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-500 transition hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
                            aria-label={clearChatLabel}
                        >
                            <Trash2 size={14} strokeWidth={1.8} />
                            {isClearingChat ? 'Clearing…' : clearChatLabel}
                        </button>
                    </div>
                </div>
            )}
            <ConfirmModal
                isOpen={isClearConfirmOpen}
                onClose={() => setIsClearConfirmOpen(false)}
                onConfirm={confirmClearChat}
                title={clearChatLabel}
                message="Clear this assistant chat? The form or workflow will not be deleted."
                confirmText="Clear chat"
                confirmVariant="danger"
                isLoading={isClearingChat}
            />
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
            <div className="p-4 bg-white/80 backdrop-blur-md border-t border-gray-200/60 shrink-0 z-10 relative">
                <div className={composerClassName}>
                    <form
                        onSubmit={(e) => { e.preventDefault(); handleSend(input); }}
                        className="relative w-full overflow-hidden rounded-[24px] border border-slate-300/80 bg-white shadow-[0_2px_12px_rgba(15,23,42,0.06)] transition focus-within:border-slate-400 focus-within:shadow-[0_3px_18px_rgba(15,23,42,0.1)]"
                    >
                        <textarea
                            ref={inputRef}
                            value={input}
                            onChange={handleInputChange}
                            onKeyDown={handleInputKeyDown}
                            placeholder={placeholder}
                            rows={1}
                            className="max-h-36 min-h-[56px] w-full resize-none overflow-y-auto bg-transparent px-5 pb-1 pt-3 text-[15px] leading-6 font-normal text-slate-800 outline-none placeholder:text-slate-400 disabled:opacity-60"
                            disabled={isTyping}
                            autoFocus
                        />
                        <div className="flex min-h-10 items-center justify-between gap-3 px-3 pb-2">
                            <div className="min-w-0 flex-1">
                                {inputAccessory}
                            </div>
                            <button
                                type="submit"
                                disabled={!input.trim() || isTyping}
                                aria-label={isTyping ? 'Generating response' : 'Send message'}
                                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-all ${input.trim() && !isTyping
                                    ? 'bg-slate-900 text-white shadow-sm hover:bg-slate-700 active:scale-95'
                                    : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                }`}
                            >
                                {isTyping ? <LoaderCircle size={18} className="animate-spin" aria-hidden="true" /> : <ArrowUp size={19} strokeWidth={2.2} aria-hidden="true" />}
                            </button>
                        </div>
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
