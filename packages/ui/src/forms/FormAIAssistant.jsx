import React, { useRef, useEffect, useState } from 'react';
import { useFormAIAssistant } from './hooks/useFormAIAssistant';
import FormDiffPreviewModal from './FormDiffPreviewModal';
import Button from '../components/ui/Button.jsx';
import FormProposalWidget from '../components/chat/FormProposalWidget.jsx';

const SUGGESTIONS = [
    "A customer satisfaction survey",
    "An event registration form",
    "A job application form",
    "A product feedback questionnaire"
];

const MessageOptionsWidget = ({ options, onSend, isTyping }) => {
    const [selectedOptions, setSelectedOptions] = useState([]);

    const handleToggle = (option) => {
        setSelectedOptions(prev => 
            prev.includes(option) ? prev.filter(o => o !== option) : [...prev, option]
        );
    };

    return (
        <div className="mt-2 flex flex-col gap-2 w-full max-w-[90%] bg-slate-50 border border-slate-200 p-2.5 rounded-xl">
            <div className="flex flex-col gap-1.5">
                {options.map((option, idx) => {
                    const isChecked = selectedOptions.includes(option);
                    return (
                        <label 
                            key={idx} 
                            className={`flex items-start gap-2.5 p-2 rounded-lg border cursor-pointer transition-colors ${isChecked ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-slate-200 hover:border-indigo-300'}`}
                        >
                            <input 
                                type="checkbox" 
                                checked={isChecked}
                                disabled={isTyping}
                                onChange={() => handleToggle(option)}
                                className="mt-0.5 w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 disabled:opacity-50"
                            />
                            <span className={`text-sm ${isChecked ? 'text-indigo-900 font-medium' : 'text-slate-700'}`}>
                                {option}
                            </span>
                        </label>
                    );
                })}
            </div>
            <Button 
                variant="primary" 
                size="sm" 
                onClick={() => {
                    if (selectedOptions.length > 0) {
                        onSend(selectedOptions.join(', '));
                    }
                }}
                disabled={selectedOptions.length === 0 || isTyping}
                className="w-full mt-1"
            >
                Send Selected
            </Button>
        </div>
    );
};

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
        handleRejectProposal,
        acceptingProposalId,
        rejectingProposalId
    } = useFormAIAssistant(form, onUpdateForm);

    const scrollContainerRef = useRef(null);
    const messagesEndRef = useRef(null);
    const initialScrollDone = useRef(false);
    const [previewProposal, setPreviewProposal] = useState(null);

    // Auto-scroll to bottom of chat
    useEffect(() => {
        if (isLoadingHistory || messages.length === 0) return;

        // Give React a tick to render the messages
        requestAnimationFrame(() => {
            if (!scrollContainerRef.current || !messagesEndRef.current) return;
            
            if (!initialScrollDone.current) {
                // Force scroll to bottom on initial load
                messagesEndRef.current.scrollIntoView({ behavior: 'auto' });
                initialScrollDone.current = true;
            } else {
                // Only auto-scroll if near bottom or AI is typing
                const { scrollHeight, scrollTop, clientHeight } = scrollContainerRef.current;
                const isNearBottom = scrollHeight - scrollTop <= clientHeight + 150;
                
                if (isNearBottom || isTyping) {
                    messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
                }
            }
        });
    }, [messages, isTyping, isLoadingHistory]);

    const handleScroll = () => {
        if (scrollContainerRef.current && scrollContainerRef.current.scrollTop === 0 && hasMore && !isLoadingHistory) {
            loadMoreHistory();
        }
    };

    return (
        <div className="flex flex-col h-full bg-transparent relative">
            {/* Chat Body */}
            <div
                ref={scrollContainerRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto p-4 flex flex-col gap-6"
            >
                {isLoadingHistory && (
                    <div className="flex flex-col gap-4 py-4 w-full animate-pulse">
                        <div className="flex w-full justify-start">
                            <div className="w-8 h-8 rounded-full bg-slate-200 shrink-0 mt-4 mr-2.5"></div>
                            <div className="flex flex-col gap-2 w-full max-w-[85%] mt-4">
                                <div className="h-2.5 w-20 bg-slate-200 rounded"></div>
                                <div className="h-20 w-3/4 bg-slate-100 rounded-2xl rounded-tl-none border border-slate-200/50"></div>
                            </div>
                        </div>
                        <div className="flex w-full justify-end">
                            <div className="flex flex-col gap-2 w-full items-end max-w-[85%] mt-4">
                                <div className="h-2.5 w-12 bg-slate-200 rounded"></div>
                                <div className="h-12 w-2/3 bg-slate-100 rounded-2xl rounded-tr-none"></div>
                            </div>
                        </div>
                    </div>
                )}
                {messages.map((msg) => (
                    <div key={msg.id} className={`flex w-full ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                        {/* Bot Avatar */}
                        {msg.sender === 'bot' && (
                            <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 shrink-0 mt-4 mr-2.5 shadow-sm border border-indigo-200/50">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="14" x="3" y="8" rx="2"/><path d="M12 5a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"/><path d="M12 5v3"/><path d="M8 14h.01"/><path d="M16 14h.01"/><path d="M9 19h6"/></svg>
                            </div>
                        )}

                        <div className={`flex flex-col gap-1 ${msg.sender === 'user' ? 'items-end' : 'items-start'} max-w-[85%]`}>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-1">
                                {msg.sender === 'user' ? 'You' : 'Promptly AI'}
                            </span>

                            <div className={`w-full rounded-2xl p-3.5 text-sm leading-relaxed ${msg.sender === 'user'
                                    ? 'bg-indigo-600 text-white font-medium rounded-tr-none shadow-sm'
                                    : msg.isError
                                        ? 'bg-red-50 text-red-700 rounded-tl-none border border-red-200 shadow-sm'
                                        : 'bg-white text-slate-800 rounded-tl-none border border-slate-200/60 shadow-sm'
                                }`}>
                                {msg.text}

                                {/* Token Usage Indicator */}
                                {msg.tokenUsage && (
                                    <div
                                        className="mt-2 text-[10px] text-slate-400 font-medium flex items-center justify-end cursor-help"
                                        title={`Prompt: ${msg.tokenUsage.promptTokens} | Output: ${msg.tokenUsage.completionTokens}`}
                                    >
                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="mr-1 text-yellow-500">
                                            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
                                        </svg>
                                        {msg.tokenUsage.totalTokens?.toLocaleString()} tokens
                                    </div>
                                )}
                            </div>

                            {/* Quick Reply Options */}
                            {msg.options && msg.options.length > 0 && (
                                <MessageOptionsWidget 
                                    options={msg.options}
                                    onSend={handleSend}
                                    isTyping={isTyping}
                                />
                            )}

                            {/* Proposal Confirmation Box */}
                            {msg.proposal && (
                                <FormProposalWidget
                                    proposal={msg.proposal}
                                    status={msg.proposal.status}
                                    onAccept={(filteredSchema, unselectedIndices) => handleAcceptProposal(msg.id, filteredSchema || msg.proposal.schema, unselectedIndices)}
                                    onIgnore={() => handleRejectProposal(msg.id)}
                                    onPreview={() => setPreviewProposal(msg.proposal)}
                                    accepting={acceptingProposalId === msg.id}
                                    rejecting={rejectingProposalId === msg.id}
                                />
                            )}
                        </div>
                    </div>
                ))}

                {isTyping && (
                    <div className="flex w-full justify-start">
                        <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 shrink-0 mt-4 mr-2.5 shadow-sm border border-indigo-200/50">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="14" x="3" y="8" rx="2"/><path d="M12 5a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"/><path d="M12 5v3"/><path d="M8 14h.01"/><path d="M16 14h.01"/><path d="M9 19h6"/></svg>
                        </div>
                        <div className="flex flex-col gap-1 items-start max-w-[85%]">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-1">
                                Promptly AI
                            </span>
                            <div className="bg-white border border-slate-200/60 rounded-2xl rounded-tl-none p-3.5 shadow-sm flex items-center gap-1.5 h-12">
                                <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce"></span>
                                <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></span>
                                <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></span>
                            </div>
                        </div>
                    </div>
                )}

                <div ref={messagesEndRef} />
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
            <div className="p-4 bg-white/80 backdrop-blur-md border-t border-gray-200/60 shrink-0 shadow-[0_-4px_20px_-10px_rgba(0,0,0,0.05)] z-10 relative">
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
                <div className="text-center mt-2.5">
                    <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">AI can make mistakes. Please verify.</span>
                </div>

                {/* Diff Preview Modal */}
                <FormDiffPreviewModal
                    isOpen={!!previewProposal}
                    onClose={() => setPreviewProposal(null)}
                    currentForm={form}
                    proposal={previewProposal}
                />
            </div>
        </div>
    );
};

export default FormAIAssistant;
