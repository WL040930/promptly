import React, { useRef, useEffect, useState } from 'react';
import { useFormAIAssistant } from './hooks/useFormAIAssistant';
import FormDiffPreviewModal from './FormDiffPreviewModal';

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
        handleRejectProposal,
        acceptingProposalId,
        rejectingProposalId
    } = useFormAIAssistant(form, onUpdateForm);

    const scrollRef = useRef(null);
    const initialScrollDone = useRef(false);
    const [previewProposal, setPreviewProposal] = useState(null);

    // Auto-scroll to bottom of chat
    useEffect(() => {
        if (scrollRef.current && !isLoadingHistory) {
            if (!initialScrollDone.current) {
                // Force scroll to bottom on initial load
                scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
                initialScrollDone.current = true;
            } else {
                // Only auto-scroll if near bottom or AI is typing
                const isNearBottom = scrollRef.current.scrollHeight - scrollRef.current.scrollTop <= scrollRef.current.clientHeight + 100;
                if (isNearBottom || isTyping) {
                    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
                }
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
                            <div className="mt-2 flex flex-wrap gap-2 w-full max-w-[90%]">
                                {msg.options.map((option, idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => handleSend(option)}
                                        disabled={isTyping}
                                        className="text-xs font-medium bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 py-1.5 px-3 rounded-full transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed text-left"
                                    >
                                        {option}
                                    </button>
                                ))}
                            </div>
                        )}

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
                                    
                                    {/* Dynamic Summary */}
                                    {(() => {
                                        if (!msg.proposal.patches) {
                                            return <p className="text-xs text-slate-500 mt-1 font-medium leading-relaxed">Adds {msg.proposal.schema?.fields?.length || 0} fields to your canvas.</p>;
                                        }
                                        const adds = msg.proposal.patches.filter(p => p.op === 'add').length;
                                        const removes = msg.proposal.patches.filter(p => p.op === 'remove').length;
                                        const updates = msg.proposal.patches.filter(p => p.op === 'update' || p.op === 'update_meta').length;
                                        
                                        const parts = [];
                                        if (adds > 0) parts.push(`Added ${adds}`);
                                        if (removes > 0) parts.push(`Removed ${removes}`);
                                        if (updates > 0) parts.push(`Modified ${updates}`);
                                        
                                        return <p className="text-xs text-slate-500 mt-1 font-medium leading-relaxed">{parts.length > 0 ? parts.join(', ') + ' fields.' : 'No field changes.'}</p>;
                                    })()}
                                </div>
                                
                                {/* Visual Diff List */}
                                {msg.proposal.patches && msg.proposal.patches.length > 0 && (
                                    <div className="flex flex-col gap-1.5 mt-1 border border-slate-100 rounded-lg p-2 bg-white">
                                        {msg.proposal.patches.map((patch, idx) => {
                                            if (patch.op === 'add') {
                                                return (
                                                    <div key={idx} className="flex items-start gap-2 text-xs font-medium text-emerald-700 bg-emerald-50/50 px-2 py-1.5 rounded border border-emerald-100">
                                                        <span className="font-bold text-emerald-600">+</span> Added: {patch.field?.label || patch.field?.title || 'Field'}
                                                    </div>
                                                );
                                            }
                                            if (patch.op === 'remove') {
                                                return (
                                                    <div key={idx} className="flex items-start gap-2 text-xs font-medium text-red-700 bg-red-50/50 px-2 py-1.5 rounded border border-red-100">
                                                        <span className="font-bold text-red-600">-</span> Removed: {patch.label || 'Field'}
                                                    </div>
                                                );
                                            }
                                            if (patch.op === 'update') {
                                                return (
                                                    <div key={idx} className="flex items-start gap-2 text-xs font-medium text-amber-700 bg-amber-50/50 px-2 py-1.5 rounded border border-amber-100">
                                                        <span className="font-bold text-amber-600">~</span> Modified: {patch.label || 'Field'}
                                                    </div>
                                                );
                                            }
                                            if (patch.op === 'update_meta') {
                                                return (
                                                    <div key={idx} className="flex items-start gap-2 text-xs font-medium text-amber-700 bg-amber-50/50 px-2 py-1.5 rounded border border-amber-100">
                                                        <span className="font-bold text-amber-600">~</span> Modified Form Properties
                                                    </div>
                                                );
                                            }
                                            return null;
                                        })}
                                    </div>
                                )}

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
                                            disabled={acceptingProposalId === msg.id}
                                            className={`flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs py-2 rounded-lg shadow-sm hover:shadow active:scale-98 transition-all flex items-center justify-center gap-1.5 ${acceptingProposalId === msg.id ? 'opacity-75 cursor-wait' : ''}`}
                                        >
                                            {acceptingProposalId === msg.id ? (
                                                <>
                                                    <svg className="animate-spin h-3.5 w-3.5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                    </svg>
                                                    Adding...
                                                </>
                                            ) : (
                                                'Accept & Add'
                                            )}
                                        </button>
                                        <button
                                            onClick={() => setPreviewProposal(msg.proposal)}
                                            className="flex-1 bg-white hover:bg-slate-50 text-indigo-600 border border-indigo-200 font-semibold text-xs py-2 rounded-lg transition-all"
                                        >
                                            Preview
                                        </button>
                                        <button
                                            onClick={() => handleRejectProposal(msg.id)}
                                            disabled={rejectingProposalId === msg.id}
                                            className={`flex-1 bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 font-semibold text-xs py-2 rounded-lg transition-all flex items-center justify-center gap-1.5 ${rejectingProposalId === msg.id ? 'opacity-75 cursor-wait' : ''}`}
                                        >
                                            {rejectingProposalId === msg.id ? (
                                                <>
                                                    <svg className="animate-spin h-3.5 w-3.5 text-slate-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                    </svg>
                                                    Ignoring...
                                                </>
                                            ) : (
                                                'Ignore'
                                            )}
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
