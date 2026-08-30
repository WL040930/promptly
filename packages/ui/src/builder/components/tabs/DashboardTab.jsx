import { useMemo, useRef } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import {
    Activity,
    AlertTriangle,
    ArrowRight,
    Bot,
    CheckCircle2,
    ChevronRight,
    Clock3,
    FilePlus2,
    Gauge,
    Plus,
    RefreshCw,
    Workflow,
    XCircle,
    Zap
} from 'lucide-react';
import Skeleton from '../../../components/ui/Skeleton.jsx';
import { useDashboardMetrics } from '../../../api/hooks/useDashboard.js';
import { useWorkflows } from '../../../api/hooks/useWorkflows.js';
import { useExecutionLogs } from '../../../api/hooks/useLogs.js';
import { navigateTo } from '../../../utils/router.js';

const formatRelative = value => {
    if (!value) return 'Never';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Unknown';
    const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const formatDuration = durationMs => {
    if (durationMs === null || durationMs === undefined) return '—';
    return durationMs < 1000 ? `${durationMs}ms` : `${(durationMs / 1000).toFixed(1)}s`;
};

const workflowNameForLog = log => log.sourceAutomation?.name || log.workflow?.name || log.workflowNameSnapshot || log.workflowName || 'Deleted automation';

const statusForWorkflow = workflow => {
    if (workflow.isActive || workflow.status === 'Active') return 'Active';
    if (workflow.status === 'Paused') return 'Paused';
    return 'Draft';
};

function SectionHeading({ eyebrow, title, detail, action, onAction }) {
    return (
        <div className="dashboard-section-heading flex items-start justify-between gap-4">
            <div>
                {eyebrow && <p className="dashboard-section-eyebrow text-[10px] font-bold uppercase tracking-[0.18em] text-indigo-500">{eyebrow}</p>}
                <h2 className="mt-1 text-base font-bold tracking-tight text-slate-900">{title}</h2>
                {detail && <p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p>}
            </div>
            {action && <button type="button" onClick={onAction} className="dashboard-section-action inline-flex shrink-0 items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-800">{action}<ArrowRight size={14} /></button>}
        </div>
    );
}

function MetricCard({ label, value, detail, icon: Icon, tone = 'indigo', onClick }) {
    const tones = {
        indigo: 'bg-indigo-50 text-indigo-600',
        emerald: 'bg-emerald-50 text-emerald-600',
        amber: 'bg-amber-50 text-amber-600',
        slate: 'bg-slate-100 text-slate-600'
    };

    const content = (
        <>
            <div className="flex items-start justify-between gap-3">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">{label}</p>
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tones[tone] || tones.indigo}`}><Icon size={17} /></span>
            </div>
            <p className="mt-5 text-3xl font-bold tracking-tight text-slate-900">{value}</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p>
            {onClick && <span className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-indigo-600">Review <ArrowRight size={13} /></span>}
        </>
    );

    if (onClick) {
        return <button type="button" onClick={onClick} className="dashboard-metric-card group rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md">{content}</button>;
    }

    return <div className="dashboard-metric-card rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">{content}</div>;
}

function DashboardSkeleton() {
    return (
        <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[1, 2, 3, 4].map(item => <Skeleton key={item} className="h-36 rounded-2xl" />)}
            </div>
            <div className="grid gap-5 xl:grid-cols-12">
                <Skeleton className="h-80 rounded-2xl xl:col-span-7" />
                <Skeleton className="h-80 rounded-2xl xl:col-span-5" />
            </div>
        </div>
    );
}

function EmptyPanel({ icon: Icon, title, detail, action, onAction }) {
    return (
        <div className="flex min-h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-6 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-slate-400 shadow-sm"><Icon size={21} /></span>
            <p className="mt-3 text-sm font-bold text-slate-800">{title}</p>
            <p className="mt-1 max-w-xs text-xs leading-5 text-slate-500">{detail}</p>
            {action && <button type="button" onClick={onAction} className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-800">{action}<ArrowRight size={13} /></button>}
        </div>
    );
}

const DashboardTab = () => {
    const metricsQuery = useDashboardMetrics();
    const workflowsQuery = useWorkflows();
    const logsQuery = useExecutionLogs({ page: 1, pageSize: 8 });
    const container = useRef(null);

    const metrics = metricsQuery.data || {};
    const workflows = workflowsQuery.data || [];
    const recentLogs = logsQuery.data?.data || [];
    const isLoading = metricsQuery.isLoading || workflowsQuery.isLoading || logsQuery.isLoading;
    const isError = metricsQuery.isError || workflowsQuery.isError || logsQuery.isError;

    useGSAP(() => {
        if (!container.current) return;
        gsap.from(container.current, { autoAlpha: 0, y: 15, duration: 0.3, ease: 'power2.out' });
    });

    const go = page => {
        if (page === 'workflows') return navigateTo({ page: 'automations' });
        if (page === 'forms') return navigateTo({ page: 'forms' });
        if (page === 'logs') return navigateTo({ page: 'runs' });
        return undefined;
    };

    const openWorkflow = workflowId => navigateTo({ page: 'automation-build', automationId: workflowId, editor: 'visual' });
    const openRun = runId => navigateTo({ page: 'run-detail', runId });
    const retryQueries = () => {
        metricsQuery.refetch();
        workflowsQuery.refetch();
        logsQuery.refetch();
    };

    const summary = useMemo(() => {
        const active = workflows.filter(workflow => statusForWorkflow(workflow) === 'Active');
        const drafts = workflows.filter(workflow => statusForWorkflow(workflow) === 'Draft');
        const paused = workflows.filter(workflow => statusForWorkflow(workflow) === 'Paused');
        const failures = recentLogs.filter(log => String(log.status || '').toLowerCase() === 'failed');
        const failureWorkflowIds = new Set(failures.map(log => log.workflowId).filter(Boolean));

        const failureItems = failures.slice(0, 3).map(log => ({
            id: `failure-${log.id}`,
            kind: 'failure',
            title: workflowNameForLog(log),
            detail: log.error || 'A recent execution failed.',
            time: formatRelative(log.time),
            runId: log.id
        }));
        const draftItems = drafts
            .filter(workflow => !failureWorkflowIds.has(workflow.id))
            .slice(0, 3)
            .map(workflow => ({
                id: `draft-${workflow.id}`,
                kind: 'draft',
                title: workflow.name || 'Untitled automation',
                detail: 'Finish configuring this draft before activating it.',
                time: formatRelative(workflow.updatedAt),
                workflowId: workflow.id
            }));

        return {
            active,
            drafts,
            paused,
            failures,
            attentionItems: [...failureItems, ...draftItems].slice(0, 5),
            activeCount: active.length,
            draftCount: drafts.length,
            pausedCount: paused.length,
            attentionCount: failures.length + drafts.length + paused.length
        };
    }, [recentLogs, workflows]);

    const weeklyData = metrics.weeklyData || [];
    const maxRuns = Math.max(1, ...weeklyData.map(item => Number(item.runs) || 0));
    const statusLabel = isLoading
        ? 'Checking workspace health…'
        : summary.failures.length > 0
            ? `${summary.failures.length} recent failure${summary.failures.length === 1 ? '' : 's'} need review`
            : summary.draftCount > 0
                ? `${summary.draftCount} draft${summary.draftCount === 1 ? '' : 's'} waiting for setup`
                : summary.activeCount > 0
                    ? 'All active automations are running normally'
                    : 'Ready for your first automation';

    return (
        <div ref={container} className="dashboard-page surface-grid flex min-h-0 flex-1 overflow-y-auto p-4 font-sans sm:p-6 lg:p-8">
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
                <header data-tour="dashboard-overview" className="dashboard-hero workspace-surface flex flex-col gap-5 rounded-[1.75rem] p-5 sm:p-7 lg:flex-row lg:items-end lg:justify-between">
                    <div className="min-w-0">
                        <div className="dashboard-hero-kicker">
                            <p className="eyebrow">Overview</p>
                            <span className="dashboard-live-label"><span className={`h-2 w-2 shrink-0 rounded-full ${summary.failures.length > 0 ? 'bg-amber-500' : 'bg-emerald-500'}`} />Live workspace</span>
                        </div>
                        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">Workspace overview</h1>
                        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Monitor automations, review recent runs, and pick up where you left off.</p>
                        <div className="dashboard-status-line mt-4 inline-flex max-w-full items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600">
                            <span className={`h-2 w-2 shrink-0 rounded-full ${summary.failures.length > 0 ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                            <span className="truncate">{statusLabel}</span>
                        </div>
                    </div>
                    <div className="dashboard-hero-actions flex flex-wrap gap-2">
                        <button type="button" onClick={() => navigateTo({ page: 'automation-new', method: 'visual' })} className="dashboard-button dashboard-button-primary inline-flex items-center gap-2 rounded-xl bg-[#5b4ee8] px-4 py-2.5 text-sm font-bold text-white shadow-[0_8px_18px_rgba(91,78,232,0.2)] transition hover:-translate-y-0.5 hover:bg-[#4e42d0]"><Plus size={16} />New automation</button>
                        <button type="button" onClick={() => navigateTo({ page: 'assistant' })} className="dashboard-button dashboard-button-secondary inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:-translate-y-0.5 hover:bg-slate-50"><Bot size={16} />Open assistant</button>
                    </div>
                </header>

                {isError ? (
                    <div className="flex flex-col items-start gap-4 rounded-2xl border border-red-200 bg-red-50 p-5 sm:flex-row sm:items-center sm:justify-between">
                        <div><p className="font-bold text-red-800">The workspace overview could not load.</p><p className="mt-1 text-sm text-red-700">Try again to refresh your automation and execution data.</p></div>
                        <button type="button" onClick={retryQueries} className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-3.5 py-2 text-sm font-bold text-white hover:bg-red-700"><RefreshCw size={15} />Try again</button>
                    </div>
                ) : isLoading ? <DashboardSkeleton /> : (
                    <>
                        <section className="dashboard-metrics grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                            <MetricCard label="Active now" value={summary.activeCount} detail="Automations currently enabled" icon={Zap} tone="indigo" onClick={() => go('workflows')} />
                            <MetricCard label="Drafts" value={summary.draftCount} detail="Automations still being built" icon={Workflow} tone="slate" onClick={() => go('workflows')} />
                            <MetricCard label="Success rate" value={metrics.successRate || '—'} detail={`${metrics.totalRuns || 0} recorded executions`} icon={Gauge} tone="emerald" onClick={() => go('logs')} />
                            <MetricCard label="Needs review" value={summary.attentionCount} detail={`${summary.failures.length} recent failures · ${summary.pausedCount} paused`} icon={AlertTriangle} tone="amber" onClick={() => go('workflows')} />
                        </section>

                        <section className="grid gap-5 xl:grid-cols-12">
                            <div className="dashboard-panel min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 xl:col-span-7">
                                <SectionHeading eyebrow="Needs attention" title="Items to review" detail="Failures, drafts, and paused automations." action="View automations" onAction={() => go('workflows')} />
                                <div className="mt-5 space-y-2 min-w-0">
                                    {summary.attentionItems.length > 0 ? summary.attentionItems.map(item => (
                                        <button key={item.id} type="button" onClick={() => item.runId ? openRun(item.runId) : openWorkflow(item.workflowId)} className="group flex w-full min-w-0 items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/60 p-3 text-left transition hover:border-indigo-200 hover:bg-indigo-50/50">
                                            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${item.kind === 'failure' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}`}>{item.kind === 'failure' ? <XCircle size={17} /> : <Workflow size={17} />}</span>
                                            <span className="min-w-0 flex-1 overflow-hidden"><span className="block truncate text-sm font-bold text-slate-800" title={item.title}>{item.title}</span><span className="mt-0.5 block truncate text-xs text-slate-500" title={item.detail}>{item.detail}</span></span>
                                            <span className="hidden shrink-0 text-[11px] text-slate-400 sm:block">{item.time}</span><ChevronRight size={16} className="shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-indigo-500" />
                                        </button>
                                    )) : <EmptyPanel icon={CheckCircle2} title="Nothing needs attention" detail="Your workspace is clear. New runs and drafts will appear here when they need review." onAction={() => go('workflows')} action="Open automations" />}
                                </div>
                            </div>

                            <div className="dashboard-panel min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 xl:col-span-5">
                                <SectionHeading eyebrow="Recent runs" title="Latest activity" detail="The most recent automation runs." action="View all" onAction={() => go('logs')} />
                                <div className="mt-5 space-y-1 min-w-0">
                                    {recentLogs.length > 0 ? recentLogs.slice(0, 5).map(log => {
                                        const normalizedStatus = String(log.status || '').toLowerCase();
                                        const success = ['success', 'succeeded'].includes(normalizedStatus);
                                        const waiting = ['waiting', 'running', 'resuming', 'pending'].includes(normalizedStatus);
                                        const cancelled = normalizedStatus === 'cancelled';
                                        return <button key={log.id} type="button" onClick={() => openRun(log.id)} className="group flex w-full min-w-0 items-center gap-3 rounded-xl p-2.5 text-left transition hover:bg-slate-50"><span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${success ? 'bg-emerald-50 text-emerald-600' : waiting ? 'bg-amber-50 text-amber-600' : cancelled ? 'bg-slate-100 text-slate-500' : 'bg-red-50 text-red-600'}`}>{success ? <CheckCircle2 size={16} /> : waiting ? <Clock3 size={16} /> : <XCircle size={16} />}</span><span className="min-w-0 flex-1 overflow-hidden"><span className="block truncate text-sm font-semibold text-slate-800" title={workflowNameForLog(log)}>{workflowNameForLog(log)}</span><span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-400"><span className="truncate">{waiting ? 'Waiting for approval' : cancelled ? 'Cancelled because automation was deleted' : log.trigger || 'Manual run'}</span><span>·</span><span className="shrink-0">{formatRelative(log.time)}</span></span></span><span className="shrink-0 text-[11px] font-medium text-slate-400">{formatDuration(log.durationMs)}</span></button>;
                                    }) : <EmptyPanel icon={Activity} title="No executions yet" detail="Runs appear here after you test or trigger an automation. Explore the sample workspace if you want to see the full loop first." onAction={() => go('workflows')} action="Open automations" />}
                                </div>
                            </div>
                        </section>

                        <section className="grid gap-5 xl:grid-cols-12">
                            <div className="dashboard-panel rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 xl:col-span-7">
                                <SectionHeading eyebrow="Run volume" title="This week" detail="Execution count over the last seven days." />
                                <div className="mt-6 flex h-48 items-end gap-2 sm:gap-4">
                                    {weeklyData.map((item, index) => {
                                        const runs = Number(item.runs) || 0;
                                        const height = runs === 0 ? 8 : Math.max(12, (runs / maxRuns) * 100);
                                        return <div key={`${item.day}-${index}`} className="dashboard-chart-column group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2"><div className="relative flex h-full w-full max-w-12 items-end"><span className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 rounded-lg bg-slate-800 px-2 py-1 text-[10px] font-bold text-white opacity-0 transition group-hover:opacity-100">{runs}</span><div className={`dashboard-chart-bar w-full rounded-t-xl transition-all ${runs === maxRuns && runs > 0 ? 'bg-indigo-600' : 'bg-indigo-200 group-hover:bg-indigo-400'}`} style={{ height: `${height}%` }} /></div><span className="text-[11px] font-semibold text-slate-400">{item.day}</span></div>;
                                    })}
                                </div>
                                {weeklyData.every(item => !Number(item.runs)) && <p className="mt-3 text-center text-xs text-slate-400">No runs recorded in the last 7 days.</p>}
                            </div>

                            <div className="dashboard-guidance-card rounded-2xl border border-slate-800 p-5 text-white shadow-lg sm:p-6 xl:col-span-5">
                                <div className="flex h-full flex-col">
                                    <div className="dashboard-guidance-topline"><span className="dashboard-guidance-mark"><Bot size={18} /></span><span>Need a hand?</span></div>
                                    <h2 className="mt-5 text-xl font-bold tracking-tight">Build from an outcome.</h2>
                                    <p className="mt-2 text-sm leading-6 text-slate-300">Describe what you want to happen, or open the builder and connect the steps yourself.</p>
                                    <div className="mt-auto flex flex-wrap gap-2 pt-6"><button type="button" onClick={() => navigateTo({ page: 'automation-new', method: 'ai' })} className="dashboard-guidance-primary inline-flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-xs font-bold"><Bot size={14} />Describe a workflow<ArrowRight size={13} /></button><button type="button" onClick={() => navigateTo({ page: 'automation-new', method: 'visual' })} className="dashboard-guidance-secondary inline-flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-xs font-bold"><Plus size={14} />Open builder</button></div>
                                </div>
                            </div>
                        </section>

                        <section className="dashboard-quick-actions grid gap-3 sm:grid-cols-3">
                            <button type="button" onClick={() => go('workflows')} className="dashboard-quick-action flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-indigo-200 hover:shadow-md"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"><Workflow size={17} /></span><span className="min-w-0 flex-1"><span className="block text-sm font-bold text-slate-800">Manage automations</span><span className="mt-0.5 block text-xs text-slate-500">Open, edit, or activate flows</span></span><ArrowRight size={16} className="text-slate-300" /></button>
                            <button type="button" onClick={() => go('forms')} className="dashboard-quick-action flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-indigo-200 hover:shadow-md"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600"><FilePlus2 size={17} /></span><span className="min-w-0 flex-1"><span className="block text-sm font-bold text-slate-800">Design a form</span><span className="mt-0.5 block text-xs text-slate-500">Collect the input your flows need</span></span><ArrowRight size={16} className="text-slate-300" /></button>
                            <button type="button" onClick={() => go('logs')} className="dashboard-quick-action flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-indigo-200 hover:shadow-md"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-600"><Clock3 size={17} /></span><span className="min-w-0 flex-1"><span className="block text-sm font-bold text-slate-800">Review runs</span><span className="mt-0.5 block text-xs text-slate-500">Inspect results and failures</span></span><ArrowRight size={16} className="text-slate-300" /></button>
                        </section>
                    </>
                )}
            </div>
        </div>
    );
};

export default DashboardTab;
