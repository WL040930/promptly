import { useState, useEffect, useMemo } from 'react';
import Button from '../ui/Button.jsx';
import { isAcceptedProposalStatus, isRejectedProposalStatus, isStaleProposalStatus, normalizeProposalStatus } from './proposalStatus.js';

export default function WorkflowProposalWidget({
    proposal,
    status,
    onAccept,
    onIgnore,
    onPreview,
    accepting,
    rejecting
}) {
    const isAccepted = isAcceptedProposalStatus(status);
    const isRejected = isRejectedProposalStatus(status);
    const isStale = isStaleProposalStatus(status);

    const isUnverified = proposal?.readiness?.ready === false;
    const readinessIssues = proposal?.readiness?.issues || [];
    
    const diff = proposal?.diff || { addedNodes: [], removedNodes: [], updatedNodes: [], edges: [] };
    const hasChanges = diff.addedNodes.length > 0 || diff.removedNodes.length > 0 || diff.updatedNodes.length > 0 || diff.edges.length > 0;
    
    // We only display plan steps if they were passed (often as 'plan')
    const planSteps = proposal?.plan || [];

    const handleAcceptClick = () => {
        onAccept();
    };

    const handlePreviewClick = () => {
        if (onPreview) onPreview();
    };

    return (
        <div className="mt-2 w-full border border-slate-200 rounded-xl bg-slate-50 p-4 shadow-md flex flex-col gap-4 relative overflow-hidden">
            {/* Elegant background highlight */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-bl-[100px] -z-0 pointer-events-none" />

            <div className="flex items-center justify-between border-b border-slate-200/80 pb-2 z-10">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    {proposal?.action === 'create_workflow' ? 'New Workflow Proposal' : 'Workflow Update'}
                </span>
                <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-indigo-100 text-indigo-700 uppercase tracking-wide shadow-sm">
                    Workflow
                </span>
            </div>

            <div className="z-10">
                <h4 className="text-sm font-bold text-slate-800 mb-1">
                    {proposal?.name || "Proposed Workflow"}
                </h4>
                
                {/* AI generated summary */}
                {proposal?.message && (
                    <div className="text-xs text-slate-600 font-medium leading-relaxed bg-white/60 p-2.5 rounded border border-slate-100 shadow-sm">
                        {proposal.message}
                    </div>
                )}
            </div>

            {/* Changes / Plan display */}
            {planSteps.length > 0 && (
                <div className="flex flex-col gap-2 z-10 mt-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Implementation Plan</span>
                    <ul className="flex flex-col gap-2">
                        {planSteps.map((step, idx) => (
                            <li key={idx} className="flex gap-2 text-xs">
                                <span className="flex-shrink-0 flex items-center justify-center w-4 h-4 rounded-full bg-slate-200 text-slate-500 font-bold text-[9px] mt-0.5">
                                    {idx + 1}
                                </span>
                                <div className="flex flex-col">
                                    <span className="font-semibold text-slate-700">{step.title}</span>
                                    {step.reason && <span className="text-slate-500 text-[11px] leading-relaxed mt-0.5">{step.reason}</span>}
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Diff display */}
            {hasChanges && !planSteps.length && (
                <div className="flex flex-col gap-2 z-10">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Changes</span>
                    <div className="flex flex-col gap-1.5 p-2.5 bg-white rounded-lg border border-slate-100 shadow-sm">
                        {diff.addedNodes.map((node, idx) => (
                            <div key={`add-${idx}`} className="flex items-center gap-2 text-xs font-medium text-emerald-700 px-2 py-1.5 rounded bg-emerald-50/50">
                                <span className="font-bold text-emerald-500 text-sm leading-none">+</span>
                                Added {node.title || node.subType}
                            </div>
                        ))}
                        {diff.updatedNodes.map((node, idx) => (
                            <div key={`update-${idx}`} className="flex items-center gap-2 text-xs font-medium text-amber-700 px-2 py-1.5 rounded bg-amber-50/50">
                                <span className="font-bold text-amber-500 text-sm leading-none">~</span>
                                Modified {node.title || node.subType}
                            </div>
                        ))}
                        {diff.removedNodes.map((node, idx) => (
                            <div key={`remove-${idx}`} className="flex items-center gap-2 text-xs font-medium text-red-700 px-2 py-1.5 rounded bg-red-50/50">
                                <span className="font-bold text-red-500 text-sm leading-none">-</span>
                                Removed {node.title || node.subType}
                            </div>
                        ))}
                        {diff.edges.length > 0 && (
                            <div className="flex items-center gap-2 text-xs font-medium text-indigo-700 px-2 py-1.5 rounded bg-indigo-50/50">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
                                Updated {diff.edges.length} connection{diff.edges.length > 1 ? 's' : ''}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {isUnverified && (
                <div className="z-10 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800 shadow-sm">
                    <span className="font-bold flex items-center gap-1.5 mb-1">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                        Setup Required
                    </span>
                    The workflow needs configuration before it can run.
                    {readinessIssues.length > 0 && (
                        <ul className="mt-1.5 list-disc pl-4 opacity-90 space-y-0.5">
                            {readinessIssues.map((issue, index) => <li key={index}>{issue.message}</li>)}
                        </ul>
                    )}
                </div>
            )}

            <div className="z-10 mt-1">
                {isAccepted ? (
                    <div className="flex items-center gap-1.5 justify-center py-2 px-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg text-xs font-bold shadow-sm transition-all duration-300">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        Added to Canvas
                    </div>
                ) : isRejected ? (
                    <div className="flex items-center gap-1.5 justify-center py-2 px-3 bg-slate-100 border border-slate-200 text-slate-500 rounded-lg text-xs font-bold shadow-sm transition-all duration-300">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        Proposal Ignored
                    </div>
                ) : isStale ? (
                    <div className="flex items-center justify-center py-2 px-3 bg-amber-50 border border-amber-200 text-amber-700 rounded-lg text-xs font-bold shadow-sm transition-all duration-300">
                        {normalizeProposalStatus(status) === 'superseded'
                            ? 'A newer proposal replaced this suggestion.'
                            : 'This suggestion is outdated. Generate a new one.'}
                    </div>
                ) : (
                    <div className="flex gap-2">
                        <Button 
                            variant="primary" 
                            size="sm" 
                            className="flex-1 font-bold shadow-sm hover:shadow active:scale-[0.98] transition-all" 
                            onClick={handleAcceptClick}
                            isLoading={accepting}
                            loadingText="Adding..."
                        >
                            Accept
                        </Button>
                        <Button 
                            variant="outline" 
                            size="sm" 
                            className="flex-1 font-bold bg-white shadow-sm hover:bg-slate-50 active:scale-[0.98] transition-all" 
                            onClick={handlePreviewClick}
                        >
                            Preview
                        </Button>
                        <Button 
                            variant="secondary" 
                            size="sm" 
                            className="flex-1 font-bold shadow-sm hover:bg-slate-200 active:scale-[0.98] transition-all" 
                            onClick={onIgnore}
                            isLoading={rejecting}
                            loadingText="Ignoring..."
                        >
                            Ignore
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}
