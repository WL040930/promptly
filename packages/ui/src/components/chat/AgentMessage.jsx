import React from 'react';
import Button from '../ui/Button.jsx';
import FormProposalWidget from './FormProposalWidget.jsx';
import MarkdownRenderer from '../ui/MarkdownRenderer.jsx';
import MessageOptionsWidget from './MessageOptionsWidget.jsx';

const statusLabel = (status) => {
    if (status === 'applied') return 'Applied';
    if (status === 'ignored') return 'Ignored';
    return status;
};

export default function AgentMessage({ message, onApply, onIgnore, onOption, isTyping, isAccepting, isRejecting }) {
    const payload = message.payload || message.proposal || {};
    const isProposal = message.proposal != null || ['workflow_proposal', 'workflow_diff', 'form_proposal'].includes(message.kind);
    const status = statusLabel(message.proposalStatus || payload.status);
    const options = message.options || payload.options || [];
    const kind = message.kind || (message.proposal ? 'form_proposal' : (options.length > 0 ? 'clarification' : 'text'));

    return (
        <div className={`flex w-full ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
            {message.sender !== 'user' && (
                <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 shrink-0 mt-4 mr-2.5 shadow-sm border border-indigo-200/50">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="14" x="3" y="8" rx="2"/><path d="M12 5a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"/><path d="M12 5v3"/><path d="M8 14h.01"/><path d="M16 14h.01"/><path d="M9 19h6"/></svg>
                </div>
            )}
            <div className={`flex flex-col gap-1 ${message.sender === 'user' ? 'items-end' : 'items-start'} max-w-[90%] min-w-0`}>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-1">
                    {message.sender === 'user' ? 'You' : 'Promptly AI'}
                </span>
                <div className={`w-full min-w-0 overflow-x-auto rounded-2xl p-3.5 text-sm leading-relaxed whitespace-pre-wrap ${message.sender === 'user' ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-white text-slate-800 rounded-tl-none border border-slate-200/60 shadow-sm'}`}>
                    <MarkdownRenderer content={message.text} inverted={message.sender === 'user'} />
                    {message.tokenUsage && (
                        <div
                            className="mt-2 text-[10px] text-slate-400 font-medium flex items-center justify-end cursor-help"
                            title={`Prompt: ${message.tokenUsage.promptTokens} | Output: ${message.tokenUsage.completionTokens}`}
                        >
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="mr-1 text-yellow-500">
                                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
                            </svg>
                            {message.tokenUsage.totalTokens?.toLocaleString()} tokens
                        </div>
                    )}
                </div>

                {kind === 'clarification' && options.length > 0 && (
                    <MessageOptionsWidget 
                        options={options}
                        onSend={(selected) => onOption?.(selected)}
                        isTyping={isTyping}
                    />
                )}

                {isProposal && kind === 'form_proposal' && (
                    <FormProposalWidget 
                        proposal={payload}
                        status={status}
                        onAccept={(filteredSchema, unselectedIndices) => onApply?.(message, filteredSchema, unselectedIndices)}
                        onIgnore={() => onIgnore?.(message)}
                        onPreview={() => onOption?.({ type: 'preview_form', proposal: payload, formId: payload.formId })}
                        onPreviewUpdate={(filteredProposal) => onOption?.({ type: 'preview_update', proposal: filteredProposal, formId: payload.formId })}
                        accepting={isAccepting}
                        rejecting={isRejecting}
                    />
                )}

                {isProposal && kind !== 'form_proposal' && (
                    <div className="mt-2 w-full border border-slate-200 rounded-xl bg-slate-50 p-3 flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                                {message.kind === 'workflow_diff' ? 'Workflow changes' : 'Workflow proposal'}
                            </span>
                            {payload.name && <span className="text-xs font-bold text-slate-700">{payload.name}</span>}
                        </div>
                        {message.kind === 'workflow_proposal' && (
                            <div className="flex flex-col gap-1">
                                {(payload.plan || []).map((item, index) => <div key={`${item.subType}-${index}`} className="text-xs text-slate-600"><span className="font-bold text-slate-800">{item.title}</span>{item.reason ? ` — ${item.reason}` : ''}</div>)}
                                {payload.needsForm && <div className="text-xs font-semibold text-orange-700">A form will be created before this workflow can run.</div>}
                            </div>
                        )}
                        {message.kind === 'workflow_diff' && (
                            <div className="flex flex-col gap-1 text-xs">
                                {(payload.diff?.addedNodes || []).map(node => <div key={`a-${node.id}`} className="text-emerald-700">+ {node.title}</div>)}
                                {(payload.diff?.updatedNodes || []).map(node => <div key={`u-${node.id}`} className="text-amber-700">~ {node.title}</div>)}
                                {(payload.diff?.removedNodes || []).map(node => <div key={`r-${node.id}`} className="text-red-700">− {node.title}</div>)}
                                {(payload.diff?.edges || []).length > 0 && <div className="text-indigo-700">↔ Edge connections changed</div>}
                            </div>
                        )}
                        {status ? (
                            <div className={`text-center text-xs font-semibold py-2 rounded-lg ${status === 'Applied' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{status}</div>
                        ) : (
                            <div className="flex gap-2">
                                <Button variant="primary" size="sm" className="flex-1" onClick={() => onApply?.(message)}>Apply</Button>
                                <Button variant="outline" size="sm" className="flex-1" onClick={() => onIgnore?.(message)}>Ignore</Button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
