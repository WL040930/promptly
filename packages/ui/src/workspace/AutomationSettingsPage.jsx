import React, { useState } from 'react';
import { useWorkflow, useUpdateWorkflow } from '../api/hooks/useWorkflows.js';
import { useToast } from '../context/ToastContext.jsx';

export default function AutomationSettingsPage({ automationId }) {
    const toast = useToast();
    const { data: automation, isPending } = useWorkflow(automationId);
    const updateMutation = useUpdateWorkflow();
    const [name, setName] = useState('');

    React.useEffect(() => { if (automation?.name) setName(automation.name); }, [automation?.name]);

    if (isPending) return <div className="surface-grid h-full p-8 text-sm text-slate-500">Loading automation settings…</div>;
    const save = event => {
        event.preventDefault();
        updateMutation.mutate({ id: automationId, data: { name, expectedRevision: automation?.revision, source: 'visual', summary: 'Updated automation settings' } }, { onSuccess: () => toast.success('Automation settings saved.'), onError: error => toast.error(error.message || 'Could not save settings.') });
    };
    return <div className="surface-grid min-h-full overflow-y-auto p-6 md:p-10"><div className="mx-auto max-w-2xl"><p className="eyebrow">Automation settings</p><h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-slate-900">{automation?.name || 'Automation'}</h1><form onSubmit={save} className="workspace-surface mt-8 space-y-5 rounded-[1.5rem] p-6"><label className="block text-sm font-bold text-slate-700">Name<input value={name} onChange={event => setName(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-normal outline-none transition focus:border-[#5b4ee8] focus:bg-white focus:ring-4 focus:ring-[#5b4ee8]/10" /></label><div className="flex justify-end"><button type="submit" disabled={updateMutation.isPending} className="rounded-xl bg-[#5b4ee8] px-4 py-2.5 text-sm font-bold text-white shadow-[0_8px_18px_rgba(91,78,232,0.18)] hover:bg-[#4e42d0] disabled:opacity-60">{updateMutation.isPending ? 'Saving…' : 'Save changes'}</button></div></form></div></div>;
}
