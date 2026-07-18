import React from 'react';
import { useWorkflow, useRestoreWorkflowVersion, useWorkflowVersions } from '../api/hooks/useWorkflows.js';
import { useToast } from '../context/ToastContext.jsx';

export default function AutomationVersionsPage({ automationId }) {
    const toast = useToast();
    const { data: automation } = useWorkflow(automationId);
    const { data: versions = [], isPending } = useWorkflowVersions(automationId);
    const restoreMutation = useRestoreWorkflowVersion();

    const restore = version => restoreMutation.mutate({ id: automationId, versionId: version.id }, {
        onSuccess: () => toast.success(`Revision ${version.versionNumber} restored as a new draft.`),
        onError: error => toast.error(error.message || 'Could not restore revision.')
    });

    return <div className="min-h-full overflow-y-auto bg-slate-50 p-6 md:p-10">
        <div className="mx-auto max-w-4xl">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-500">Versions</p>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">{automation?.name || 'Automation'} history</h1>
            <p className="mt-2 text-sm text-slate-500">Every AI, visual, restore, and publish change is kept as an immutable revision.</p>
            <div className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                {isPending ? <div className="p-6 text-sm text-slate-500">Loading revisions…</div> : versions.length === 0 ? <div className="p-10 text-center text-sm text-slate-500">No revisions yet.</div> : versions.map(version => <div key={version.id} className="flex items-center justify-between gap-4 border-b border-slate-100 p-5 last:border-0"><div><p className="font-bold text-slate-800">Revision {version.versionNumber}</p><p className="mt-1 text-xs text-slate-500">{version.source || 'system'}{version.summary ? ` · ${version.summary}` : ''}</p></div><button type="button" onClick={() => restore(version)} disabled={restoreMutation.isPending} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700">Restore</button></div>)}
            </div>
        </div>
    </div>;
}
