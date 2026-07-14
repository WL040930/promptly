import React, { useState, useEffect } from 'react';
import Button from '../ui/Button.jsx';

export default function FormProposalWidget({ 
    proposal, 
    status, 
    onAccept, 
    onIgnore, 
    onPreview, 
    accepting, 
    rejecting 
}) {
    const isAccepted = status === 'Applied' || status === 'accepted';
    const isRejected = status === 'Ignored' || status === 'rejected';

    // Track which "add" patches are checked by the user
    const [selectedAdds, setSelectedAdds] = useState({});

    // Initialize all "add" patches to true by default, unless they were previously unselected
    useEffect(() => {
        if (proposal?.patches) {
            const initial = {};
            proposal.patches.forEach((patch, idx) => {
                if (patch.op === 'add') {
                    if (proposal.unselectedPatchIndices && proposal.unselectedPatchIndices.includes(idx)) {
                        initial[idx] = false;
                    } else {
                        initial[idx] = true;
                    }
                }
            });
            setSelectedAdds(initial);
        }
    }, [proposal]);

    const handleToggleAdd = (idx) => {
        if (isAccepted || isRejected) return;
        setSelectedAdds(prev => ({ ...prev, [idx]: !prev[idx] }));
    };

    const handleAcceptClick = () => {
        if (!proposal?.schema) return onAccept();

        // Filter out any "add" patches that were unchecked
        const unselectedIndices = Object.keys(selectedAdds).filter(idx => !selectedAdds[idx]).map(Number);
        
        let filteredSchema = { ...proposal.schema };
        
        if (unselectedIndices.length > 0 && filteredSchema.fields) {
            // Find the field IDs that were unchecked
            const unselectedFieldIds = unselectedIndices.map(idx => proposal.patches[idx]?.field?.id).filter(Boolean);
            
            // Remove those fields from the schema
            filteredSchema.fields = filteredSchema.fields.filter(f => !unselectedFieldIds.includes(f.id));
        }

        // Pass back the filtered schema and the unselected indices so we can persist them
        onAccept(filteredSchema, unselectedIndices);
    };

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
                        if (patch.op === 'add') {
                            const isChecked = selectedAdds[idx];
                            return (
                                <div key={idx} className={`flex items-start gap-2 text-xs font-medium px-2 py-1.5 rounded border transition-colors ${isChecked ? 'text-emerald-700 bg-emerald-50/50 border-emerald-100' : 'text-slate-400 bg-slate-50 border-slate-100'}`}>
                                    <label className="flex items-center gap-2 cursor-pointer w-full">
                                        <input 
                                            type="checkbox" 
                                            checked={!!isChecked} 
                                            onChange={() => handleToggleAdd(idx)}
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
                        onClick={onPreview}
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
