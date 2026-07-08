import React, { useState } from 'react';
import { useWorkflowVersions, useRestoreWorkflowVersion } from '../../../api/hooks/useWorkflows.js';
import WorkflowDiffPreviewModal from '../modals/WorkflowDiffPreviewModal.jsx';

export default function VersionHistorySidebar({ workflowId, currentWorkflow }) {
    const { data: versions = [], isLoading } = useWorkflowVersions(workflowId);
    const restoreMutation = useRestoreWorkflowVersion();
    const [previewVersion, setPreviewVersion] = useState(null);

    return (
        <div className="flex flex-col h-full bg-slate-50">
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
                        <div className="flex items-center gap-2 mt-2">
                            <button
                                onClick={() => setPreviewVersion(v)}
                                className="flex-1 text-xs font-bold py-1.5 border border-slate-200 text-slate-700 rounded bg-white hover:bg-slate-50 transition-colors shadow-sm"
                            >
                                Preview
                            </button>
                            <button
                                onClick={() => {
                                    if (window.confirm(`Are you sure you want to restore Version ${v.versionNumber}? This will overwrite your current draft.`)) {
                                        restoreMutation.mutate({ id: workflowId, versionId: v.id });
                                    }
                                }}
                                className="flex-1 text-xs font-bold py-1.5 border border-indigo-200 text-indigo-700 rounded bg-indigo-50 hover:bg-indigo-100 transition-colors shadow-sm"
                            >
                                Restore
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            <WorkflowDiffPreviewModal 
                isOpen={!!previewVersion}
                onClose={() => setPreviewVersion(null)}
                currentWorkflow={currentWorkflow}
                versionWorkflow={previewVersion}
                onRestore={() => {
                    if (previewVersion) {
                        restoreMutation.mutate({ id: workflowId, versionId: previewVersion.id });
                    }
                }}
            />
        </div>
    );
}
