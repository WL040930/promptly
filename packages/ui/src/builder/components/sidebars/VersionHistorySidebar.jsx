import { useState } from 'react';
import { useWorkflowVersions, useRestoreWorkflowVersion } from '../../../api/hooks/useWorkflows.js';
import WorkflowDiffPreviewModal from '../modals/WorkflowDiffPreviewModal.jsx';
import { useToast } from '../../../context/ToastContext.jsx';
import Button from '../../../components/ui/Button.jsx';
import ConfirmModal from '../../../components/modals/ConfirmModal.jsx';
import VersionHistorySkeleton from './VersionHistorySkeleton.jsx';

export default function VersionHistorySidebar({ workflowId, currentWorkflow }) {
    const { data: versions = [], isLoading } = useWorkflowVersions(workflowId);
    const restoreMutation = useRestoreWorkflowVersion();
    const [previewVersion, setPreviewVersion] = useState(null);
    const [isRestoringSuccess, setIsRestoringSuccess] = useState(false);
    const toast = useToast();

    const [versionToRestore, setVersionToRestore] = useState(null);

    return (
        <div className="flex flex-col h-full bg-slate-50">
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {isLoading && <VersionHistorySkeleton />}
                {!isLoading && versions.length === 0 && (
                    <div className="text-sm text-slate-500 text-center py-4">No saved versions yet.</div>
                )}
                
                {versions.map(v => (
                    <div key={v.id} className="border border-slate-200 rounded-lg p-3 bg-white shadow-sm flex flex-col gap-2">
                        <div className="flex min-w-0 flex-col gap-1">
                            <div className="flex min-w-0 items-center gap-2">
                                <span className="whitespace-nowrap text-sm font-medium text-slate-800">Version {v.versionNumber}</span>
                                {currentWorkflow?.publishedRevisionId === v.id && (
                                    <span className="whitespace-nowrap rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-emerald-700">Live</span>
                                )}
                                {currentWorkflow?.draftRevisionId === v.id && currentWorkflow?.publishedRevisionId !== v.id && (
                                    <span className="whitespace-nowrap rounded-full border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-indigo-700">Current draft</span>
                                )}
                            </div>
                            <span className="truncate text-[11px] font-medium text-slate-400">
                                {new Date(v.createdAt).toLocaleString(undefined, {
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric',
                                    hour: 'numeric',
                                    minute: '2-digit'
                                })}
                            </span>
                        </div>
                        <div className="text-xs text-slate-500">
                            {v.nodes?.length || 0} nodes, {v.edges?.length || 0} edges
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                            <Button
                                variant="outline"
                                size="xs"
                                className="flex-1 py-1.5"
                                onClick={() => setPreviewVersion(v)}
                            >
                                Preview
                            </Button>
                            <Button
                                variant="primary"
                                size="xs"
                                className="flex-1 py-1.5"
                                onClick={() => setVersionToRestore(v)}
                            >
                                Restore
                            </Button>
                        </div>
                    </div>
                ))}
            </div>

            <ConfirmModal
                isOpen={!!versionToRestore}
                onClose={() => setVersionToRestore(null)}
                onConfirm={() => {
                    if (versionToRestore) {
                        restoreMutation.mutate({ id: workflowId, versionId: versionToRestore.id }, {
                            onSuccess: () => {
                                toast.success(`Restored Version ${versionToRestore.versionNumber}!`);
                                setVersionToRestore(null);
                            },
                            onError: () => toast.error('Failed to restore version.')
                        });
                    }
                }}
                title={`Restore Version ${versionToRestore?.versionNumber}`}
                message="Are you sure you want to restore this version? This will overwrite your current draft."
                confirmText="Restore Version"
                confirmVariant="primary"
                isLoading={restoreMutation.isPending}
            />

            <WorkflowDiffPreviewModal 
                isOpen={!!previewVersion}
                currentWorkflow={currentWorkflow}
                versionWorkflow={previewVersion}
                onRestore={() => {
                    if (previewVersion) {
                        restoreMutation.mutate({ id: workflowId, versionId: previewVersion.id }, {
                            onSuccess: () => {
                                toast.success(`Restored Version ${previewVersion.versionNumber}!`);
                                setIsRestoringSuccess(true);
                            },
                            onError: () => toast.error('Failed to restore version.')
                        });
                    }
                }}
                isRestoring={restoreMutation.isPending}
                isRestoringSuccess={isRestoringSuccess}
                onClose={() => {
                    setPreviewVersion(null);
                    setIsRestoringSuccess(false);
                }}
            />
        </div>
    );
}
