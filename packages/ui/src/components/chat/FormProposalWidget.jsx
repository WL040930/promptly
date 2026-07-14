import React, { useState, useEffect } from 'react';
import Button from '../ui/Button.jsx';

export default function FormProposalWidget({ 
    proposal, 
    status, 
    onAccept, 
    onIgnore, 
    onPreview,
    onPreviewUpdate, 
    accepting, 
    rejecting 
}) {
    const isAccepted = status === 'Applied' || status === 'accepted';
    const isRejected = status === 'Ignored' || status === 'rejected';

    // Track which patches are checked by the user
    const [selectedPatches, setSelectedPatches] = useState({});

    // Initialize all patches to true by default, unless they were previously unselected
    useEffect(() => {
        if (proposal?.patches) {
            const initial = {};
            proposal.patches.forEach((patch, idx) => {
                if (proposal.unselectedPatchIndices && proposal.unselectedPatchIndices.includes(idx)) {
                    initial[idx] = false;
                } else {
                    initial[idx] = true;
                }
            });
            setSelectedPatches(initial);
        }
    }, [proposal]);

    const handleTogglePatch = (idx) => {
        if (isAccepted || isRejected) return;
        setSelectedPatches(prev => ({ ...prev, [idx]: !prev[idx] }));
    };

    const getFilteredProposal = () => {
        const unselectedIndices = Object.keys(selectedPatches).filter(idx => !selectedPatches[idx]).map(Number);
        
        let filteredSchema = { ...proposal.schema };
        if (!filteredSchema.fields) {
            filteredSchema.fields = [];
        } else {
            filteredSchema.fields = [...filteredSchema.fields];
        }
        
        if (unselectedIndices.length > 0 && proposal.patches) {
            // Revert patches (process in reverse order of indices)
            const sortedUnselected = [...unselectedIndices].sort((a, b) => b - a);

            for (const idx of sortedUnselected) {
                const patch = proposal.patches[idx];
                if (!patch) continue;

                if (patch.op === 'add') {
                    filteredSchema.fields = filteredSchema.fields.filter(f => f.id !== patch.field?.id);
                } else if (patch.op === 'remove') {
                    if (patch.originalField) {
                        const originalIndex = patch.originalIndex ?? filteredSchema.fields.length;
                        filteredSchema.fields.splice(originalIndex, 0, patch.originalField);
                    }
                } else if (patch.op === 'update') {
                    if (patch.originalField) {
                        filteredSchema.fields = filteredSchema.fields.map(f => f.id === patch.id ? patch.originalField : f);
                    }
                } else if (patch.op === 'update_meta') {
                    if (patch.originalMeta) {
                        filteredSchema.title = patch.originalMeta.title;
                        filteredSchema.description = patch.originalMeta.description;
                    }
                }
            }
        }

        return {
            filteredSchema,
            unselectedIndices,
            // Create a new proposal object that has the updated schema and patches
            filteredProposal: {
                ...proposal,
                schema: filteredSchema,
                // Only keep patches that were actually selected so the preview modal renders them correctly
                patches: proposal.patches.filter((_, idx) => !unselectedIndices.includes(idx))
            }
        };
    };

    const handleAcceptClick = () => {
        if (!proposal?.schema) return onAccept();

        const { filteredSchema, unselectedIndices } = getFilteredProposal();
        onAccept(filteredSchema, unselectedIndices);
    };

    const handlePreviewClick = () => {
        if (!proposal?.schema) return onPreview();
        
        const { filteredProposal } = getFilteredProposal();
        onPreview(filteredProposal);
    };

    useEffect(() => {
        if (onPreviewUpdate && proposal?.schema) {
            const { filteredProposal } = getFilteredProposal();
            onPreviewUpdate(filteredProposal);
        }
    }, [selectedPatches, onPreviewUpdate]); // Re-fire whenever selected patches change

    return (
        <div className="mt-2 w-full border border-slate-200 rounded-xl bg-slate-50 p-3 shadow-md flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-slate-200/70 pb-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Proposed Form Update</span>
                <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700">
                    Schema
                </span>
            </div>

            <div>
                <h4 className="text-sm font-semibold text-slate-800">{proposal?.schema?.title || "Form Update"}</h4>

                {(() => {
                    if (!proposal?.patches) {
                        return <p className="text-xs text-slate-500 mt-1 font-medium leading-relaxed">Adds {proposal?.schema?.fields?.length || 0} fields to your canvas.</p>;
                    }
                    const adds = proposal.patches.filter(p => p.op === 'add').length;
                    const removes = proposal.patches.filter(p => p.op === 'remove').length;
                    const updates = proposal.patches.filter(p => p.op === 'update' || p.op === 'update_meta').length;

                    const parts = [];
                    if (adds > 0) parts.push(`Added ${adds}`);
                    if (removes > 0) parts.push(`Removed ${removes}`);
                    if (updates > 0) parts.push(`Modified ${updates}`);

                    return <p className="text-xs text-slate-500 mt-1 font-medium leading-relaxed">{parts.length > 0 ? parts.join(', ') + ' fields.' : 'No field changes.'}</p>;
                })()}
            </div>

            {proposal?.patches && proposal.patches.length > 0 && (
                <div className="flex flex-col gap-1.5 mt-1 border border-slate-100 rounded-lg p-2 bg-white">
                    {proposal.patches.map((patch, idx) => {
                        const isChecked = selectedPatches[idx];
                        if (patch.op === 'add') {
                            return (
                                <div key={idx} className={`flex items-start gap-2 text-xs font-medium px-2 py-1.5 rounded border transition-colors ${isChecked ? 'text-emerald-700 bg-emerald-50/50 border-emerald-100' : 'text-slate-400 bg-slate-50 border-slate-100'}`}>
                                    <label className="flex items-center gap-2 cursor-pointer w-full">
                                        <input 
                                            type="checkbox" 
                                            checked={!!isChecked} 
                                            onChange={() => handleTogglePatch(idx)}
                                            disabled={isAccepted || isRejected}
                                            className="w-3.5 h-3.5 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 disabled:opacity-50"
                                        />
                                        <span className="flex-1">
                                            <span className={`font-bold ${isChecked ? 'text-emerald-600' : 'text-slate-400'}`}>+</span> Added: {patch.field?.label || patch.field?.title || 'Field'}
                                        </span>
                                    </label>
                                </div>
                            );
                        }
                        if (patch.op === 'remove') {
                            return (
                                <div key={idx} className={`flex items-start gap-2 text-xs font-medium px-2 py-1.5 rounded border transition-colors ${isChecked ? 'text-red-700 bg-red-50/50 border-red-100' : 'text-slate-400 bg-slate-50 border-slate-100'}`}>
                                    <label className="flex items-center gap-2 cursor-pointer w-full">
                                        <input 
                                            type="checkbox" 
                                            checked={!!isChecked} 
                                            onChange={() => handleTogglePatch(idx)}
                                            disabled={isAccepted || isRejected}
                                            className="w-3.5 h-3.5 text-red-600 rounded border-slate-300 focus:ring-red-500 disabled:opacity-50"
                                        />
                                        <span className="flex-1">
                                            <span className={`font-bold ${isChecked ? 'text-red-600' : 'text-slate-400'}`}>-</span> Removed: {patch.label || 'Field'}
                                        </span>
                                    </label>
                                </div>
                            );
                        }
                        if (patch.op === 'update' || patch.op === 'update_meta') {
                            return (
                                <div key={idx} className={`flex items-start gap-2 text-xs font-medium px-2 py-1.5 rounded border transition-colors ${isChecked ? 'text-amber-700 bg-amber-50/50 border-amber-100' : 'text-slate-400 bg-slate-50 border-slate-100'}`}>
                                    <label className="flex items-center gap-2 cursor-pointer w-full">
                                        <input 
                                            type="checkbox" 
                                            checked={!!isChecked} 
                                            onChange={() => handleTogglePatch(idx)}
                                            disabled={isAccepted || isRejected}
                                            className="w-3.5 h-3.5 text-amber-600 rounded border-slate-300 focus:ring-amber-500 disabled:opacity-50"
                                        />
                                        <span className="flex-1">
                                            <span className={`font-bold ${isChecked ? 'text-amber-600' : 'text-slate-400'}`}>~</span> {patch.op === 'update_meta' ? 'Modified Form Properties' : `Modified: ${patch.label || 'Field'}`}
                                        </span>
                                    </label>
                                </div>
                            );
                        }
                        return null;
                    })}
                </div>
            )}

            {isAccepted ? (
                <div className="flex items-center gap-1.5 justify-center py-1.5 px-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg text-xs font-semibold">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    Added to Canvas
                </div>
            ) : isRejected ? (
                <div className="flex items-center gap-1.5 justify-center py-1.5 px-3 bg-slate-100 border border-slate-200 text-slate-500 rounded-lg text-xs font-semibold">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    Proposal Ignored
                </div>
            ) : (
                <div className="flex gap-2">
                    <Button 
                        variant="primary" 
                        size="sm" 
                        className="flex-1" 
                        onClick={handleAcceptClick}
                        isLoading={accepting}
                        loadingText="Adding..."
                    >
                        Accept
                    </Button>
                    <Button 
                        variant="outline" 
                        size="sm" 
                        className="flex-1" 
                        onClick={handlePreviewClick}
                    >
                        Preview
                    </Button>
                    <Button 
                        variant="secondary" 
                        size="sm" 
                        className="flex-1" 
                        onClick={onIgnore}
                        isLoading={rejecting}
                        loadingText="Ignoring..."
                    >
                        Ignore
                    </Button>
                </div>
            )}
        </div>
    );
}
