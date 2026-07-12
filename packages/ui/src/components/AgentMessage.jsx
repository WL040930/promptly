import React from 'react';
import Button from './Button.jsx';

const statusLabel = (status) => {
    if (status === 'applied') return 'Applied';
    if (status === 'ignored') return 'Ignored';
    return null;
};

export default function AgentMessage({ message, onApply, onIgnore, onOption }) {
    const payload = message.payload || {};
    const isProposal = ['workflow_proposal', 'workflow_diff', 'form_proposal'].includes(message.kind);
    const status = statusLabel(message.proposalStatus);
    const options = payload.options || [];

    return (
        <div className={`flex w-full ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
            {message.sender !== 'user' && (
                <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 shrink-0 mt-4 mr-2.5 border border-indigo-200/50">
                    <span className="text-xs font-black">✦</span>
                </div>
            )}
            <div className={`flex flex-col gap-1 ${message.sender === 'user' ? 'items-end' : 'items-start'} max-w-[90%]`}>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-1">
                    {message.sender === 'user' ? 'You' : 'AI Assistant'}
                </span>
                <div className={`w-full rounded-2xl p-3.5 text-sm leading-relaxed whitespace-pre-wrap ${message.sender === 'user' ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-white text-slate-800 rounded-tl-none border border-slate-200/60 shadow-sm'}`}>
                    {message.text}
                </div>

                {message.kind === 'clarification' && options.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                        {options.map((option, index) => {
                            const label = typeof option === 'string' ? option : option.name || option.title || option.label;
                            return <Button key={`${label}-${index}`} variant="secondary" size="sm" onClick={() => onOption?.(option)}>{label}</Button>;
                        })}
                    </div>
                )}

                {isProposal && (
                    <div className="mt-2 w-full border border-slate-200 rounded-xl bg-slate-50 p-3 flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                                {message.kind === 'workflow_diff' ? 'Workflow changes' : message.kind === 'form_proposal' ? 'Form proposal' : 'Workflow proposal'}
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
                        {message.kind === 'form_proposal' && (
                            <div className="flex flex-col gap-1 text-xs text-slate-600">
                                <div>{(payload.schema?.fields || []).length} field(s) prepared for review.</div>
                                {(payload.schema?.fields || []).slice(0, 8).map(field => <div key={field.id || field.label} className="flex items-center justify-between border-b border-slate-200/70 pb-1"><span className="font-semibold text-slate-700">{field.label || field.title || 'Untitled field'}</span><span className="text-slate-400">{field.type}</span></div>)}
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
