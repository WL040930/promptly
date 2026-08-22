import { AlertTriangle, CheckCircle2, Pause, Play, Rocket, XCircle } from 'lucide-react';
import Button from '../ui/Button.jsx';
import { isRejectedProposalStatus, isStaleProposalStatus, normalizeProposalStatus } from './proposalStatus.js';

const actionMeta = {
    publish: { label: 'Publish automation', icon: Rocket, confirm: 'Publish' },
    pause: { label: 'Pause automation', icon: Pause, confirm: 'Pause' },
    test_run: { label: 'Run test', icon: Play, confirm: 'Run test' },
    live_run: { label: 'Run live', icon: Play, confirm: 'Run live now' }
};

const prettyJson = value => JSON.stringify(value || {}, null, 2);

export default function WorkflowLifecycleProposalWidget({ proposal, status, summary, onAccept, onIgnore, accepting, rejecting }) {
    const normalizedStatus = normalizeProposalStatus(status);
    const meta = actionMeta[proposal?.action] || actionMeta.publish;
    const Icon = meta.icon;
    const result = proposal?.result || null;
    const run = result?.run || null;
    const isApplied = normalizedStatus === 'applied';
    const isFailed = normalizedStatus === 'failed';
    const isRejected = isRejectedProposalStatus(normalizedStatus);
    const isStale = isStaleProposalStatus(normalizedStatus);
    const isApplying = normalizedStatus === 'applying' || accepting;

    if (isApplied || isFailed || isRejected || isStale) {
        const failedRun = run && !['succeeded', 'waiting', 'running', 'resuming', 'pending'].includes(run.status);
        const showFailure = isFailed || Boolean(proposal?.error) || failedRun;
        return (
            <section className={`mt-2 w-full overflow-hidden rounded-2xl border bg-white shadow-sm ${showFailure ? 'border-red-200' : isApplied ? 'border-emerald-200' : 'border-slate-200'}`}>
                <div className="flex items-start gap-3 px-4 py-3.5">
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${showFailure ? 'border-red-200 bg-red-50 text-red-600' : isApplied ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-500'}`}>
                        {showFailure ? <XCircle size={17} /> : isApplied ? <CheckCircle2 size={17} /> : <Icon size={17} />}
                    </span>
                    <div className="min-w-0 flex-1">
                        <p className={`text-[10px] font-extrabold uppercase tracking-[0.14em] ${showFailure ? 'text-red-700' : isApplied ? 'text-emerald-700' : 'text-slate-600'}`}>
                            {showFailure ? 'Action failed' : isApplied ? 'Action completed' : isStale ? 'Action is stale' : 'Action ignored'}
                        </p>
                        <p className="mt-0.5 text-sm font-extrabold text-slate-900">{meta.label}</p>
                        <p className="mt-1 text-xs leading-5 text-slate-500">{summary || proposal?.summary || `Workflow: ${proposal?.workflowName || 'Unknown'}`}</p>
                        {run && <p className="mt-1 text-xs font-semibold text-slate-600">Run {run.id} · {run.status}{run.durationMs !== null && run.durationMs !== undefined ? ` · ${run.durationMs}ms` : ''}</p>}
                        {(proposal?.error || showFailure && run?.error) && <p className="mt-2 rounded-lg border border-red-100 bg-red-50 px-2.5 py-2 text-xs text-red-700">{proposal?.error?.message || run?.error || 'The action could not be completed.'}</p>}
                    </div>
                </div>
            </section>
        );
    }

    return (
        <section className={`mt-2 w-full overflow-hidden rounded-2xl border bg-white shadow-sm ${proposal?.action === 'live_run' ? 'border-rose-200' : 'border-indigo-100'}`}>
            <header className={`flex items-start gap-3 border-b px-4 py-3.5 ${proposal?.action === 'live_run' ? 'border-rose-100 bg-rose-50/70' : 'border-indigo-100 bg-indigo-50/60'}`}>
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${proposal?.action === 'live_run' ? 'border-rose-200 bg-rose-100 text-rose-700' : 'border-indigo-200 bg-indigo-100 text-indigo-600'}`}>
                    <Icon size={17} />
                </span>
                <div className="min-w-0 flex-1">
                    <p className={`text-[10px] font-extrabold uppercase tracking-[0.14em] ${proposal?.action === 'live_run' ? 'text-rose-700' : 'text-indigo-700'}`}>Action approval</p>
                    <h4 className="mt-1 text-sm font-extrabold text-slate-900">{meta.label}</h4>
                    <p className="mt-1 text-xs leading-5 text-slate-600">{summary || proposal?.summary}</p>
                </div>
                <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-700">Awaiting approval</span>
            </header>

            <div className="space-y-3 px-4 py-3.5">
                <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-2"><span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">Workflow</span><span className="mt-0.5 block truncate font-semibold text-slate-800">{proposal?.workflowName || proposal?.workflowId}</span></div>
                    <div className="rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-2"><span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">Trigger</span><span className="mt-0.5 block font-semibold capitalize text-slate-800">{proposal?.triggerType || 'manual'}</span></div>
                </div>
                {proposal?.runPayload && (
                    <div>
                        <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.13em] text-slate-400">Exact run payload</p>
                        <pre className="max-h-40 overflow-auto rounded-xl bg-slate-900 px-3 py-2.5 text-xs leading-5 text-emerald-300">{prettyJson(proposal.runPayload)}</pre>
                    </div>
                )}
                {proposal?.warning && <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs leading-5 text-rose-800"><AlertTriangle size={15} className="mt-0.5 shrink-0" /><span>{proposal.warning}</span></div>}
                {Array.isArray(proposal?.remainingActions) && proposal.remainingActions.length > 0 && <p className="text-xs text-slate-500">Next actions will be reviewed separately: <span className="font-semibold text-slate-700">{proposal.remainingActions.join(' → ')}</span></p>}
            </div>

            <footer className="flex gap-2 border-t border-slate-100 bg-slate-50/70 px-4 py-3">
                <Button variant="ghost" size="sm" className="flex-1" onClick={onIgnore} isLoading={rejecting} disabled={isApplying} loadingText="Ignoring…">Ignore</Button>
                <Button variant={proposal?.action === 'live_run' ? 'dangerSolid' : 'primary'} size="sm" className="flex-1" onClick={onAccept} isLoading={accepting} disabled={isApplying} loadingText="Applying…">{meta.confirm}</Button>
            </footer>
        </section>
    );
}

