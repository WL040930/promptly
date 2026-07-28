import { useWorkflow, useRestoreWorkflowVersion, useWorkflowVersions } from '../api/hooks/useWorkflows.js';
import { useToast } from '../context/ToastContext.jsx';
import { useState } from 'react';
import PagePagination from '../components/ui/PagePagination.jsx';

export default function AutomationVersionsPage({ automationId }) {
    const toast = useToast();
    const [page, setPage] = useState(1);
    const { data: automation } = useWorkflow(automationId);
    const { data: versionPage, isPending } = useWorkflowVersions(automationId, { source: 'release', page });
    const versions = versionPage?.data || [];
    const pagination = versionPage?.pagination;
    const restoreMutation = useRestoreWorkflowVersion();

    const restore = version => restoreMutation.mutate({ id: automationId, versionId: version.id }, {
        onSuccess: () => toast.success(`Revision ${version.versionNumber} restored as a new draft.`),
        onError: error => toast.error(error.message || 'Could not restore revision.')
    });

    return <div className="surface-grid min-h-full overflow-y-auto p-6 md:p-10">
        <div className="mx-auto max-w-4xl">
            <p className="eyebrow">Versions</p>
            <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-slate-900">{automation?.name || 'Automation'} history</h1>
            <p className="mt-2 text-sm text-slate-500">Published releases are immutable. Restoring one copies it into your draft; it does not change live work until you publish.</p>
            <div className="workspace-surface mt-8 overflow-hidden rounded-[1.5rem]">
                {isPending ? <div className="p-6 text-sm text-slate-500">Loading releases…</div> : versions.length === 0 ? <div className="p-10 text-center text-sm text-slate-500">No published releases yet.</div> : <>{versions.map(version => <div key={version.id} className="flex items-center justify-between gap-4 border-b border-slate-100 p-5 last:border-0"><div><p className="font-bold text-slate-800">Release {version.versionNumber}</p><p className="mt-1 text-xs text-slate-500">{version.summary || 'Published release'} · {version.nodeCount} steps</p></div><button type="button" onClick={() => restore(version)} disabled={restoreMutation.isPending} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700">Restore to draft</button></div>)}{pagination?.totalPages > 1 && <div className="m-4 mt-0"><PagePagination pagination={pagination} itemLabel="releases" onPageChange={setPage} /></div>}</>}
            </div>
        </div>
    </div>;
}
