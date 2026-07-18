import React, { useState } from 'react';
import { useWorkflow, useUpdateWorkflow } from '../api/hooks/useWorkflows.js';
import { useToast } from '../context/ToastContext.jsx';

export default function AutomationSettingsPage({ automationId }) {
    const toast = useToast();
    const { data: automation, isPending } = useWorkflow(automationId);
    const updateMutation = useUpdateWorkflow();
    const [name, setName] = useState('');

    React.useEffect(() => { if (automation?.name) setName(automation.name); }, [automation?.name]);

    if (isPending) return <div className="p-8 text-sm text-slate-500">Loading automation settings…</div>;
    const save = event => {
        event.preventDefault();
        updateMutation.mutate({ id: automationId, data: { name, expectedRevision: automation?.revision, source: 'visual', summary: 'Updated automation settings' } }, { onSuccess: () => toast.success('Automation settings saved.'), onError: error => toast.error(error.message || 'Could not save settings.') });
    };
    return <div className="min-h-full overflow-y-auto bg-slate-50 p-6 md:p-10"><div className="mx-auto max-w-2xl"><p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-500">Automation settings</p><h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">{automation?.name || 'Automation'}</h1><form onSubmit={save} className="mt-8 space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><label className="block text-sm font-bold text-slate-700">Name<input value={name} onChange={event => setName(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal" /></label><div className="flex justify-end"><button type="submit" disabled={updateMutation.isPending} className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white">Save changes</button></div></form></div></div>;
}
