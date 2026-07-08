import React from 'react';
import { useWorkflowVersions, useRestoreWorkflowVersion } from '../../../api/hooks/useWorkflows.js';

export default function VersionHistorySidebar({ workflowId, onClose }) {
    const { data: versions = [], isLoading } = useWorkflowVersions(workflowId);
    const restoreMutation = useRestoreWorkflowVersion();

    return (
        <div className="w-80 bg-white border-l border-slate-200 h-full flex flex-col shadow-xl z-20">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-slate-50">
                <h3 className="font-semibold text-slate-800">Version History</h3>
                <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {isLoading && <div className="text-sm text-slate-500 text-center py-4">Loading history...</div>}
                {!isLoading && versions.length === 0 && (
                    <div className="text-sm text-slate-500 text-center py-4">No saved versions yet.</div>
                )}
                
                {versions.map(v => (
                    <div key={v.id} className="border border-slate-200 rounded-lg p-3 bg-white shadow-sm flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                            <span className="font-medium text-slate-800 text-sm">Version {v.versionNumber}</span>
                            <span className="text-xs text-slate-500">{new Date(v.createdAt).toLocaleString()}</span>
                        </div>
                        <div className="text-xs text-slate-500">
                            {v.nodes?.length || 0} nodes, {v.edges?.length || 0} edges
                        </div>
                        <button
                            onClick={() => {
                                if (window.confirm(`Are you sure you want to restore Version ${v.versionNumber}? This will overwrite your current draft.`)) {
                                    restoreMutation.mutate({ id: workflowId, versionId: v.id });
                                }
                            }}
                            className="mt-1 w-full text-xs font-medium py-1.5 border border-indigo-200 text-indigo-600 rounded bg-indigo-50 hover:bg-indigo-100 transition-colors"
                        >
                            Restore this version
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}
