import React from 'react';
import Button from '../ui/Button.jsx';
import FormProposalWidget from './FormProposalWidget.jsx';
import MarkdownRenderer from '../ui/MarkdownRenderer.jsx';
import MessageOptionsWidget from './MessageOptionsWidget.jsx';
import { Zap } from 'lucide-react';

const statusLabel = (status) => {
    if (status === 'applied') return 'Applied';
    if (status === 'ignored') return 'Ignored';
    return status;
};

const formatTokens = (value) => (value || 0).toLocaleString();

const TokenUsageBreakdown = ({ tokenUsage }) => {
    const stages = Object.entries(tokenUsage.stages || {});

    return (
        <div className="relative flex justify-end px-3.5 pb-3.5">
            <span
                tabIndex="0"
                aria-label="Show token usage breakdown"
                className="group relative inline-flex cursor-help items-center text-[10px] font-medium text-slate-400 outline-none focus-visible:text-slate-600"
            >
                <Zap size={11} strokeWidth={2.5} className="mr-1 text-yellow-500" />
                {formatTokens(tokenUsage.totalTokens)} tokens
                <span
                    role="tooltip"
                    className="pointer-events-none absolute bottom-full right-0 z-50 mb-2 hidden w-64 rounded-lg border border-slate-200 bg-white p-3 text-left text-[11px] text-slate-600 shadow-xl group-hover:block group-focus:block"
                >
                    <span className="mb-2 block text-xs font-semibold text-slate-800">Token usage</span>
                    <span className="flex items-center justify-between">
                        <span>Prompt</span>
                        <span className="font-medium text-slate-800">{formatTokens(tokenUsage.promptTokens)}</span>
                    </span>
                    <span className="flex items-center justify-between">
                        <span>Output</span>
                        <span className="font-medium text-slate-800">{formatTokens(tokenUsage.completionTokens)}</span>
                    </span>
                    {stages.length > 0 && (
                        <span className="mt-2 block border-t border-slate-100 pt-2">
                            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Stages</span>
                            {stages.map(([stage, usage]) => (
                                <span key={stage} className="flex items-center justify-between gap-3 py-0.5">
                                    <span className="truncate">{stage}</span>
                                    <span className="shrink-0 font-medium text-slate-800">{formatTokens(usage.totalTokens)}</span>
                                </span>
                            ))}
                        </span>
                    )}
                </span>
            </span>
        </div>
    );
};

export default function AgentMessage({ message, onApply, onIgnore, onOption, isTyping, isAccepting, isRejecting }) {
    const payload = message.payload || message.proposal || {};
    const isProposal = message.proposal != null || ['workflow_proposal', 'workflow_diff', 'form_proposal'].includes(message.kind);
    const status = statusLabel(message.proposalStatus || payload.status);
    const options = message.options || payload.options || [];
    const kind = message.kind || (message.proposal ? 'form_proposal' : (options.length > 0 ? 'clarification' : 'text'));
    const planSteps = Array.isArray(payload.plan) ? payload.plan : (Array.isArray(payload.plan?.steps) ? payload.plan.steps : []);
    const planSummary = typeof payload.plan?.summary === 'string' ? payload.plan.summary : null;

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
                <div className={`relative w-full min-w-0 rounded-2xl ${message.sender === 'user' ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-white text-slate-800 rounded-tl-none border border-slate-200/60 shadow-sm'}`}>
                    <div className="w-full min-w-0 overflow-x-auto p-3.5 text-sm leading-relaxed">
                        {message.sender === 'user' ? (
                            <div className="whitespace-pre-wrap text-white/90">{message.text}</div>
                        ) : (
                            <MarkdownRenderer content={message.text} />
                        )}
                    </div>
                    {message.tokenUsage && <TokenUsageBreakdown tokenUsage={message.tokenUsage} />}
                </div>

                {message.sender !== 'user' && kind === 'form_proposal' && planSteps.length > 0 && (
                    <div className="w-full rounded-xl border border-indigo-100 bg-indigo-50/60 px-3 py-2.5 text-xs text-slate-600">
                        <div className="mb-1 font-semibold text-slate-800">Plan</div>
                        {planSummary && <div className="mb-2 text-slate-600">{planSummary}</div>}
                        <div className="flex flex-col gap-1">
                            {planSteps.map((step, index) => (
                                <div key={step.id || `${step.title || step.type}-${index}`} className="flex gap-2">
                                    <span className="font-semibold text-indigo-600">{index + 1}.</span>
                                    <span>{step.title || step.reason || step.type}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {message.sender !== 'user' && kind === 'agent_plan_review' && (
                    <div className="w-full rounded-xl border border-indigo-100 bg-indigo-50/60 px-3 py-3 text-xs text-slate-600">
                        <div className="mb-1 font-semibold text-slate-800">Plan for review</div>
                        {planSummary && <div className="mb-2 text-slate-600">{planSummary}</div>}
                        {planSteps.length > 0 && (
                            <div className="mb-3 flex flex-col gap-1">
                                {planSteps.map((step, index) => (
                                    <div key={step.id || `${step.title || step.type}-${index}`} className="flex gap-2">
                                        <span className="font-semibold text-indigo-600">{index + 1}.</span>
                                        <span>{step.title || step.reason || step.type}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                        <div className="flex gap-2">
                            <Button
                                variant="primary"
                                size="sm"
                                className="flex-1"
                                onClick={() => onOption?.({ type: 'agent_plan_approved', runId: payload.runId })}
                                disabled={!payload.runId || isTyping}
                            >
                                Proceed
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                className="flex-1"
                                onClick={() => onOption?.({ type: 'agent_plan_rejected', runId: payload.runId })}
                                disabled={!payload.runId || isTyping}
                            >
                                Cancel
                            </Button>
                        </div>
                    </div>
                )}

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
                                {planSteps.map((item, index) => <div key={`${item.subType || item.id || item.type}-${index}`} className="text-xs text-slate-600"><span className="font-bold text-slate-800">{item.title || item.type}</span>{item.reason || item.description ? ` — ${item.reason || item.description}` : ''}</div>)}
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
