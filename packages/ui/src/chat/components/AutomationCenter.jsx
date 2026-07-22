import { Fragment, useMemo, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import {
    Activity,
    AlertTriangle,
    Bot,
    CheckCircle2,
    ChevronDown,
    ChevronRight,
    Clock3,
    Copy,
    ExternalLink,
    Filter,
    History,
    Pause,
    Play,
    Plus,
    RefreshCw,
    Search,
    Sparkles,
    Trash2,
    Workflow as WorkflowIcon,
    X,
    XCircle,
    Zap
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '../../context/ToastContext.jsx';
import { useCreateWorkflow, useDeleteWorkflow, usePauseWorkflow, usePublishWorkflow, useRestoreWorkflowVersion, useWorkflow, useWorkflowVersions, useWorkflows } from '../../api/hooks/useWorkflows.js';
import { useRunWorkflow } from '../../api/hooks/useRunWorkflow.js';
import { useExecutionLogs } from '../../api/hooks/useLogs.js';
import { useDashboardMetrics } from '../../api/hooks/useDashboard.js';
import ConfirmModal from '../../components/modals/ConfirmModal.jsx';
import TestRunModal from '../../builder/components/modals/TestRunModal.jsx';
import { navigate } from '../../utils/router.js';

const STATUS_FILTERS = ['All', 'Active', 'Draft', 'Paused'];
const HEALTH_FILTERS = ['All', 'Healthy', 'Needs attention', 'No runs'];

const formatRelative = (value) => {
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

const formatDuration = (durationMs) => {
    if (durationMs === null || durationMs === undefined) return '—';
    return durationMs < 1000 ? `${durationMs}ms` : `${(durationMs / 1000).toFixed(2)}s`;
};

const getTriggerLabel = (workflow) => {
    const trigger = (workflow?.nodes || []).find(node => node.type === 'trigger');
    const subtype = String(trigger?.subType || workflow?.triggerType || '').toLowerCase();
    if (subtype.includes('form')) return 'Form submission';
    if (subtype.includes('webhook')) return 'Webhook';
    if (subtype.includes('schedule') || subtype.includes('cron')) return 'Schedule';
    return workflow?.triggerType || 'No trigger';
};

const getActivationIssue = workflow => {
    if (!workflow || workflow.isActive) return null;
    const triggerCount = (workflow.nodes || []).filter(node => node.type === 'trigger').length;
    if (triggerCount === 0) return 'Add exactly one trigger node in Builder before activating this automation.';
    if (triggerCount !== 1) return 'This automation must contain exactly one trigger node before it can be activated.';
    return null;
};

const getWorkflowErrorMessage = error => error?.payload?.issues?.[0]?.message || error?.message || 'Could not update automation status.';

const getHealth = (workflow, logs) => {
    const workflowLogs = logs.filter(log => log.workflowId === workflow.id || log.workflow?.id === workflow.id);
    if (workflowLogs.length === 0) return 'No runs';
    return workflowLogs.slice(0, 5).some(log => log.status === 'Failed') ? 'Needs attention' : 'Healthy';
};

const getLatestLog = (workflow, logs) => logs
    .filter(log => log.workflowId === workflow.id || log.workflow?.id === workflow.id)
    .sort((a, b) => new Date(b.time || 0) - new Date(a.time || 0))[0] || null;

const getHealthStyles = (health) => {
    if (health === 'Healthy') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (health === 'Needs attention') return 'bg-amber-50 text-amber-700 border-amber-200';
    return 'bg-slate-50 text-slate-500 border-slate-200';
};

const buildChatUrl = (workflowId, prompt = '') => {
    const params = new URLSearchParams();
    if (workflowId) params.set('automationId', workflowId);
    if (prompt) params.set('prompt', prompt);
    const query = params.toString();
    return `/app/assistant${query ? `?${query}` : ''}`;
};

function StatCard({ label, value, detail, icon: Icon, tone = 'slate' }) {
    const tones = {
        slate: 'bg-slate-50 text-slate-600',
        indigo: 'bg-indigo-50 text-indigo-600',
        emerald: 'bg-emerald-50 text-emerald-600',
        amber: 'bg-amber-50 text-amber-600'
    };
    return (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</p>
                    <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{value}</p>
                    <p className="mt-1 text-xs text-slate-500">{detail}</p>
                </div>
                <div className={`rounded-xl p-2.5 ${tones[tone] || tones.slate}`}><Icon size={18} /></div>
            </div>
        </div>
    );
}

function EmptyState({ onCreateWithAI, onBuildManually }) {
    const starters = [
        'Follow up after a form submission',
        'Send a notification when something happens',
        'Create a scheduled report',
        'Describe my own automation'
    ];
    return (
        <div className="rounded-3xl border border-dashed border-indigo-200 bg-gradient-to-br from-indigo-50/80 via-white to-cyan-50/50 p-8 text-center md:p-12">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-500/20">
                <Sparkles size={26} />
            </div>
            <h3 className="mt-5 text-xl font-bold tracking-tight text-slate-900">What would you like to automate?</h3>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">Describe the result you want. Promptly will prepare a workflow for your review before anything is changed.</p>
            <div className="mx-auto mt-6 grid max-w-3xl gap-2 text-left sm:grid-cols-2">
                {starters.map(starter => (
                    <button key={starter} type="button" onClick={() => onCreateWithAI(starter)} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-300 hover:text-indigo-700">
                        <span>{starter}</span><ChevronRight size={16} className="shrink-0 text-slate-400" />
                    </button>
                ))}
            </div>
            <button type="button" onClick={onBuildManually} className="mt-6 text-sm font-semibold text-slate-500 underline decoration-slate-300 underline-offset-4 hover:text-slate-800">Prefer building visually? Open the workflow builder.</button>
        </div>
    );
}

function WorkflowDetailDrawer({ workflowId, onClose, onClosed, isClosing = false, onRun, onOpenBuilder, onAskAI, onDiagnose, onToggleActive, onDuplicate }) {
    const toast = useToast();
    const drawerRef = useRef(null);
    const [showVersions, setShowVersions] = useState(false);
    const [versionToRestore, setVersionToRestore] = useState(null);
    const { data: workflow, isPending } = useWorkflow(workflowId);
    const { data: logResponse, isFetching: isLogsFetching } = useExecutionLogs({ workflowId, page: 1, pageSize: 5 });
    const { data: versions = [], isFetching: isVersionsFetching } = useWorkflowVersions(workflowId);
    const restoreVersionMutation = useRestoreWorkflowVersion();
    const logs = logResponse?.data || [];
    const latestFailure = logs.find(log => log.status === 'Failed');
    const health = workflow ? getHealth(workflow, logs) : 'No runs';
    const nodeCount = workflow?.nodes?.length || 0;
    const activationIssue = getActivationIssue(workflow);

    useGSAP(() => {
        if (!drawerRef.current) return;

        if (isClosing) {
            gsap.to(drawerRef.current, {
                xPercent: 100,
                duration: 0.24,
                ease: 'power2.in',
                onComplete: onClosed
            });
            return;
        }

        gsap.fromTo(drawerRef.current,
            { xPercent: 100 },
            { xPercent: 0, duration: 0.3, ease: 'power3.out' }
        );
    }, { scope: drawerRef, dependencies: [isClosing], revertOnUpdate: true });

    return (
        <aside ref={drawerRef} className="fixed inset-y-0 right-0 z-[70] flex w-full max-w-xl flex-col border-l border-slate-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-200 bg-slate-50/80 p-5">
                <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-indigo-500">Automation details</p>
                    <h2 className="mt-1 truncate text-xl font-bold tracking-tight text-slate-900">{isPending ? 'Loading workflow…' : workflow?.name || 'Workflow'}</h2>
                    {workflow && <p className="mt-1 text-xs text-slate-500">Updated {formatRelative(workflow.updatedAt)}</p>}
                </div>
                <button type="button" onClick={onClose} aria-label="Close workflow details" className="rounded-lg p-2 text-slate-400 hover:bg-slate-200 hover:text-slate-700"><X size={18} /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
                {isPending ? (
                    <div className="space-y-3"><div className="h-24 animate-pulse rounded-2xl bg-slate-100" /><div className="h-32 animate-pulse rounded-2xl bg-slate-100" /><div className="h-48 animate-pulse rounded-2xl bg-slate-100" /></div>
                ) : !workflow ? (
                    <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">Unable to load this workflow.</div>
                ) : (
                    <div className="space-y-5">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${workflow.isActive ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>{workflow.isActive ? 'Active' : 'Draft'}</span>
                            <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${getHealthStyles(health)}`}>{health}</span>
                            <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-500">{getTriggerLabel(workflow)}</span>
                        </div>

                        {activationIssue && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"><p className="font-bold text-amber-900">Activation needs one more step</p><p className="mt-1 leading-5">{activationIssue}</p></div>}

                        <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Workflow map</p>
                            <div className="mt-4 flex items-center gap-2 overflow-x-auto pb-1">
                                {(workflow.nodes || []).slice(0, 6).map((node, index) => (
                                    <Fragment key={node.id || index}>
                                        {index > 0 && <ChevronRight size={15} className="shrink-0 text-slate-300" />}
                                        <div className="min-w-[112px] rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                                            <p className="truncate text-[10px] font-bold uppercase tracking-wider text-indigo-500">{node.type || 'step'}</p>
                                            <p className="mt-1 truncate text-xs font-semibold text-slate-700">{node.title || node.subType || 'Untitled step'}</p>
                                        </div>
                                    </Fragment>
                                ))}
                                {nodeCount === 0 && <p className="text-sm text-slate-500">This workflow has no steps yet.</p>}
                                {nodeCount > 6 && <span className="shrink-0 text-xs font-semibold text-slate-400">+{nodeCount - 6} more</span>}
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <InfoCell label="Trigger" value={getTriggerLabel(workflow)} icon={Zap} />
                            <InfoCell label="Steps" value={`${nodeCount} configured`} icon={WorkflowIcon} />
                            <InfoCell label="Last run" value={logs[0] ? formatRelative(logs[0].time) : 'Never'} icon={Clock3} />
                            <InfoCell label="Recent runs" value={logResponse?.pagination?.total ?? logs.length} icon={Activity} />
                        </div>

                        {latestFailure && (
                            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                                <div className="flex items-start gap-3"><AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-600" /><div className="min-w-0"><p className="text-sm font-bold text-amber-900">Latest run needs attention</p><p className="mt-1 line-clamp-2 text-xs leading-5 text-amber-800">{latestFailure.error || 'The workflow reported a failure.'}</p><button type="button" onClick={() => onDiagnose(latestFailure)} className="mt-3 text-xs font-bold text-amber-900 underline underline-offset-2">Diagnose with AI</button></div></div>
                            </div>
                        )}

                        <div>
                            <div className="flex items-center justify-between"><h3 className="text-sm font-bold text-slate-900">Recent runs</h3><button type="button" onClick={() => navigate('/app/runs')} className="text-xs font-semibold text-indigo-600 hover:text-indigo-800">View all runs</button></div>
                            <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200">
                                {isLogsFetching && logs.length === 0 ? <div className="p-5 text-sm text-slate-500">Loading executions…</div> : logs.length === 0 ? <div className="p-5 text-sm text-slate-500">No executions yet. Run a test to see results here.</div> : logs.map(log => <ExecutionRow key={log.id} log={log} />)}
                            </div>
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-white">
                            <button type="button" onClick={() => setShowVersions(value => !value)} className="flex w-full items-center justify-between p-4 text-left"><span className="flex items-center gap-2 text-sm font-bold text-slate-900"><HistoryIcon />Version history</span><ChevronRight size={16} className={`text-slate-400 transition-transform ${showVersions ? 'rotate-90' : ''}`} /></button>
                            {showVersions && <div className="border-t border-slate-100 px-4 pb-4 pt-2">{isVersionsFetching ? <p className="py-3 text-xs text-slate-500">Loading versions…</p> : versions.length === 0 ? <p className="py-3 text-xs text-slate-500">No saved versions yet. Versions are created from the builder.</p> : versions.slice(0, 8).map(version => <div key={version.id} className="flex items-center justify-between gap-3 border-b border-slate-100 py-3 last:border-0"><div><p className="text-xs font-bold text-slate-700">Version {version.versionNumber}</p><p className="mt-0.5 text-[11px] text-slate-400">Saved {formatRelative(version.createdAt)}</p></div><button type="button" onClick={() => setVersionToRestore(version)} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-bold text-slate-600 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700">Restore</button></div>)} </div>}
                        </div>
                    </div>
                )}
            </div>

            {workflow && (
                <div className="grid grid-cols-2 gap-2 border-t border-slate-200 bg-white p-4 sm:grid-cols-5">
                    <button type="button" onClick={onRun} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-indigo-700"><Play size={14} />Run</button>
                    <button type="button" onClick={() => onAskAI('Explain this workflow in simple terms.')} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100"><Bot size={14} />Ask AI</button>
                    <button type="button" onClick={onOpenBuilder} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50"><ExternalLink size={14} />Builder</button>
                    <button type="button" onClick={() => onDuplicate(workflow)} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50"><Copy size={14} />Duplicate</button>
                    <button type="button" onClick={() => onToggleActive(workflow)} disabled={Boolean(activationIssue)} title={activationIssue || undefined} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">{workflow.isActive ? <Pause size={14} /> : <Play size={14} />}{workflow.isActive ? 'Pause' : 'Activate'}</button>
                </div>
            )}
            <ConfirmModal isOpen={!!versionToRestore} onClose={() => setVersionToRestore(null)} onConfirm={() => restoreVersionMutation.mutate({ id: workflowId, versionId: versionToRestore.id }, { onSuccess: () => { setVersionToRestore(null); toast.success('Workflow version restored.'); }, onError: error => toast.error(error.message || 'Could not restore this version.') })} title="Restore this version?" message={`Version ${versionToRestore?.versionNumber || ''} will replace the current workflow steps.`} confirmText="Restore" confirmVariant="primary" isLoading={restoreVersionMutation.isPending} />
        </aside>
    );
}

function HistoryIcon() {
    return <History size={14} className="text-indigo-500" />;
}

function InfoCell({ label, value, icon: Icon }) {
    return <div className="rounded-xl border border-slate-200 bg-white p-3"><div className="flex items-center gap-2 text-slate-400"><Icon size={14} /><span className="text-[10px] font-bold uppercase tracking-wider">{label}</span></div><p className="mt-2 truncate text-sm font-bold text-slate-800">{value}</p></div>;
}

function ExecutionRow({ log }) {
    const success = log.status === 'Success';
    return <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-0"><span className={success ? 'text-emerald-600' : 'text-red-500'}>{success ? <CheckCircle2 size={17} /> : <XCircle size={17} />}</span><div className="min-w-0 flex-1"><p className="text-xs font-semibold text-slate-700">{success ? 'Completed successfully' : 'Failed'}<span className="ml-2 font-normal text-slate-400">{formatRelative(log.time)}</span></p>{!success && <p className="truncate text-[11px] text-red-500">{log.error || 'Unknown error'}</p>}</div><span className="shrink-0 text-[11px] font-medium text-slate-400">{formatDuration(log.durationMs)}</span></div>;
}

export default function AutomationCenter() {
    const toast = useToast();
    const queryClient = useQueryClient();
    const container = useRef(null);
    const drawerOverlayRef = useRef(null);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('All');
    const [healthFilter, setHealthFilter] = useState('All');
    const [selectedWorkflowId, setSelectedWorkflowId] = useState(null);
    const [isClosingWorkflow, setIsClosingWorkflow] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [workflowToDelete, setWorkflowToDelete] = useState(null);
    const [runWorkflow, setRunWorkflow] = useState(null);

    const { data: workflows = [], isPending, isFetching, isError, refetch } = useWorkflows();
    const { data: metrics } = useDashboardMetrics();
    const { data: runWorkflowDetails } = useWorkflow(runWorkflow?.id);
    const { data: logsResponse } = useExecutionLogs({ page: 1, pageSize: 100 });
    const allLogs = logsResponse?.data || [];
    const createWorkflowMutation = useCreateWorkflow();
    const publishWorkflowMutation = usePublishWorkflow();
    const pauseWorkflowMutation = usePauseWorkflow();
    const deleteWorkflowMutation = useDeleteWorkflow();
    const runWorkflowMutation = useRunWorkflow();

    useGSAP(() => {
        gsap.from(container.current, {
            autoAlpha: 0,
            y: 15,
            duration: 0.3,
            ease: 'power2.out'
        });
    }, { scope: container });

    useGSAP(() => {
        if (!drawerOverlayRef.current || !selectedWorkflowId) return;

        if (isClosingWorkflow) {
            gsap.to(drawerOverlayRef.current, { autoAlpha: 0, duration: 0.2, ease: 'power2.in' });
            return;
        }

        gsap.fromTo(drawerOverlayRef.current,
            { autoAlpha: 0 },
            { autoAlpha: 1, duration: 0.2, ease: 'power2.out' }
        );
    }, { scope: drawerOverlayRef, dependencies: [selectedWorkflowId, isClosingWorkflow], revertOnUpdate: true });

    const rows = useMemo(() => workflows.map(workflow => ({
        ...workflow,
        health: getHealth(workflow, allLogs),
        latestLog: getLatestLog(workflow, allLogs)
    })), [workflows, allLogs]);
    const filteredRows = useMemo(() => rows.filter(workflow => {
        const matchesSearch = !search.trim() || workflow.name?.toLowerCase().includes(search.trim().toLowerCase());
        const lifecycle = workflow.isActive ? 'Active' : (workflow.status === 'Paused' ? 'Paused' : 'Draft');
        return matchesSearch && (statusFilter === 'All' || lifecycle === statusFilter) && (healthFilter === 'All' || workflow.health === healthFilter);
    }), [rows, search, statusFilter, healthFilter]);

    const activeCount = workflows.filter(workflow => workflow.isActive).length;
    const draftCount = workflows.length - activeCount;
    const attentionCount = rows.filter(workflow => workflow.health === 'Needs attention').length;

    const openCreateAI = (prompt = '') => navigate(buildChatUrl(null, prompt));
    const openWorkflowAI = (workflowId, prompt) => navigate(buildChatUrl(workflowId, prompt));
    const createManually = () => {
        createWorkflowMutation.mutate({ name: 'New Automation', status: 'Saved', isActive: false, iconColor: 'text-indigo-600', iconBg: 'bg-indigo-100', nodes: [], edges: [] }, {
            onSuccess: workflow => {
                toast.success('Automation created. Opening builder…');
                navigate(`/app/automations/${workflow.id}/build?editor=visual`);
            },
            onError: error => toast.error(error.message || 'Failed to create automation.')
        });
    };
    const runSelectedWorkflow = (payload) => {
        if (!runWorkflow?.id) return;
        runWorkflowMutation.mutate({ workflowId: runWorkflow.id, payload, revisionId: runWorkflow.draftRevisionId || null }, {
            onSuccess: result => {
                setRunWorkflow(null);
                setSelectedWorkflowId(runWorkflow.id);
                toast.success(result?.status === 'Success' ? 'Automation completed successfully.' : 'Automation finished with an error.');
                queryClient.invalidateQueries({ queryKey: ['executionLogs'] });
                queryClient.invalidateQueries({ queryKey: ['executionLog'] });
            },
            onError: error => toast.error(error.message || 'Automation run failed.')
        });
    };
    const toggleWorkflow = workflow => {
        const activationIssue = getActivationIssue(workflow);
        if (activationIssue) {
            toast.error(activationIssue);
            return;
        }
        const mutation = workflow.isActive ? pauseWorkflowMutation : publishWorkflowMutation;
        mutation.mutate(workflow.id, {
            onSuccess: () => toast.success(workflow.isActive ? 'Automation paused.' : 'Automation activated.'),
            onError: error => toast.error(getWorkflowErrorMessage(error))
        });
    };
    const duplicateWorkflow = workflow => {
        createWorkflowMutation.mutate({
            name: `${workflow.name || 'Automation'} copy`,
            status: 'Saved',
            isActive: false,
            icon: workflow.icon,
            iconColor: workflow.iconColor,
            iconBg: workflow.iconBg,
            nodes: workflow.nodes || [],
            edges: workflow.edges || []
        }, {
            onSuccess: created => { setSelectedWorkflowId(created.id); toast.success('Automation duplicated.'); },
            onError: error => toast.error(error.message || 'Could not duplicate automation.')
        });
    };
    const confirmDelete = () => {
        if (!workflowToDelete) return;
        deleteWorkflowMutation.mutate(workflowToDelete.id, {
            onSuccess: () => { setWorkflowToDelete(null); setSelectedWorkflowId(null); toast.success('Automation deleted.'); },
            onError: error => toast.error(error.message || 'Could not delete automation.')
        });
    };
    const openWorkflowDetails = workflowId => {
        setIsClosingWorkflow(false);
        setSelectedWorkflowId(workflowId);
    };
    const closeWorkflowDetails = () => setIsClosingWorkflow(true);
    const finishClosingWorkflow = () => {
        setSelectedWorkflowId(null);
        setIsClosingWorkflow(false);
    };
    const refreshAutomationList = () => {
        setIsRefreshing(true);
        Promise.all([
            refetch(),
            new Promise(resolve => window.setTimeout(resolve, 350))
        ]).finally(() => setIsRefreshing(false));
    };

    return (
        <>
            <div ref={container} className="surface-grid flex min-h-0 flex-1 overflow-hidden font-sans">
                <main className="min-w-0 flex-1 overflow-y-auto p-5 md:p-8">
                    <div className="mx-auto flex max-w-7xl flex-col gap-6">
                        <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
                            <div><p className="eyebrow">Automation center</p><h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-slate-900">Your automations</h1><p className="mt-2 max-w-2xl text-sm text-slate-500">Create, monitor and improve the processes that run your work.</p></div>
                            <div className="flex flex-wrap gap-2"><button type="button" onClick={() => openCreateAI()} className="inline-flex items-center gap-2 rounded-xl bg-[#5b4ee8] px-4 py-2.5 text-sm font-bold text-white shadow-[0_8px_18px_rgba(91,78,232,0.2)] hover:bg-[#4e42d0]"><Sparkles size={16} />Create with AI</button><button type="button" onClick={createManually} disabled={createWorkflowMutation.isPending} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm hover:border-[#c9c4ff] hover:bg-white disabled:opacity-60"><Plus size={16} />Build manually</button></div>
                        </header>

                        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                            <StatCard label="Active" value={activeCount} detail="Ready to run" icon={Zap} tone="indigo" />
                            <StatCard label="Draft" value={draftCount} detail="Still being designed" icon={WorkflowIcon} />
                            <StatCard label="Success rate" value={metrics?.successRate || '—'} detail={`${metrics?.totalRuns ?? 0} total executions`} icon={CheckCircle2} tone="emerald" />
                            <StatCard label="Needs attention" value={attentionCount} detail="Recent failures detected" icon={AlertTriangle} tone="amber" />
                        </section>

                        <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                                <div className="relative min-w-0 flex-1"><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search automations…" className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-800 outline-none transition-colors focus:border-indigo-400" /></div>
                                <div className="flex flex-wrap items-center gap-2"><Filter size={15} className="text-slate-400" /><FilterSelect value={statusFilter} onChange={setStatusFilter} options={STATUS_FILTERS} /><FilterSelect value={healthFilter} onChange={setHealthFilter} options={HEALTH_FILTERS} /><button type="button" onClick={refreshAutomationList} disabled={isRefreshing || isFetching} aria-label="Refresh automations" aria-busy={isRefreshing || isFetching} className="group inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition duration-200 hover:bg-slate-50 hover:text-indigo-600 active:scale-95 disabled:cursor-wait disabled:opacity-70" title="Refresh automations"><RefreshCw size={16} className={`transition-transform duration-500 ${isRefreshing || isFetching ? 'animate-spin' : 'group-hover:rotate-180'}`} /></button></div>
                            </div>
                        </section>

                        {isError ? <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center"><p className="font-semibold text-red-700">Unable to load automations.</p><button type="button" onClick={() => refetch()} className="mt-3 rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white">Try again</button></div> : isPending ? <div className="space-y-3">{[1, 2, 3].map(item => <div key={item} className="h-20 animate-pulse rounded-2xl bg-white" />)}</div> : workflows.length === 0 ? <EmptyState onCreateWithAI={openCreateAI} onBuildManually={createManually} /> : filteredRows.length === 0 ? <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center"><Search size={24} className="mx-auto text-slate-300" /><p className="mt-3 font-semibold text-slate-700">No automations match these filters.</p><button type="button" onClick={() => { setSearch(''); setStatusFilter('All'); setHealthFilter('All'); }} className="mt-3 text-sm font-semibold text-indigo-600">Clear filters</button></div> : <WorkflowTable rows={filteredRows} onSelect={openWorkflowDetails} onRun={setRunWorkflow} onOpenBuilder={id => navigate(`/app/automations/${id}/build?editor=visual`)} onAskAI={openWorkflowAI} onDelete={setWorkflowToDelete} onToggle={toggleWorkflow} onDuplicate={duplicateWorkflow} />}
                    </div>
                </main>
            </div>

            {selectedWorkflowId && <><button ref={drawerOverlayRef} type="button" aria-label="Close workflow details" onClick={closeWorkflowDetails} className="fixed inset-0 z-[60] cursor-default bg-slate-900/20 backdrop-blur-[1px]" /><WorkflowDetailDrawer workflowId={selectedWorkflowId} isClosing={isClosingWorkflow} onClose={closeWorkflowDetails} onClosed={finishClosingWorkflow} onRun={() => { const workflow = workflows.find(item => item.id === selectedWorkflowId); setRunWorkflow(workflow || null); }} onOpenBuilder={() => navigate(`/app/automations/${selectedWorkflowId}/build?editor=visual`)} onAskAI={prompt => openWorkflowAI(selectedWorkflowId, prompt)} onDiagnose={log => openWorkflowAI(selectedWorkflowId, `Diagnose this failed execution (${log.id}). Explain the root cause and propose a safe fix.`)} onToggleActive={toggleWorkflow} onDuplicate={duplicateWorkflow} /></>}

            <ConfirmModal isOpen={!!workflowToDelete} onClose={() => setWorkflowToDelete(null)} onConfirm={confirmDelete} title="Delete automation?" message={`This permanently deletes “${workflowToDelete?.name || 'this automation'}” and its configuration.`} confirmText="Delete" confirmVariant="danger" isLoading={deleteWorkflowMutation.isPending} />
            {runWorkflow && <TestRunModal isOpen={true} onClose={() => setRunWorkflow(null)} onConfirm={runSelectedWorkflow} isLoading={runWorkflowMutation.isPending} workflowId={runWorkflow.id} nodes={runWorkflowDetails?.nodes || runWorkflow.nodes || []} />}
        </>
    );
}

function FilterSelect({ value, onChange, options }) {
    const widthClass = options.includes('Needs attention') ? 'w-[150px]' : 'w-[112px]';
    return <div className={`relative ${widthClass}`}>
        <select value={value} onChange={event => onChange(event.target.value)} className="h-11 w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 px-3 pr-9 text-sm font-medium leading-5 text-slate-700 outline-none transition-colors focus:border-indigo-400">
            {options.map(option => <option key={option}>{option}</option>)}
        </select>
        <ChevronDown size={16} aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
    </div>;
}

function WorkflowTable({ rows, onSelect, onRun, onOpenBuilder, onAskAI, onDelete, onToggle, onDuplicate }) {
    return <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="hidden grid-cols-[minmax(220px,1.5fr)_100px_140px_130px_180px] gap-4 border-b border-slate-100 bg-slate-50/70 px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 md:grid"><span>Automation</span><span>Status</span><span>Health</span><span>Last run</span><span className="text-right">Actions</span></div>{rows.map(workflow => <WorkflowRow key={workflow.id} workflow={workflow} onSelect={onSelect} onRun={onRun} onOpenBuilder={onOpenBuilder} onAskAI={onAskAI} onDelete={onDelete} onToggle={onToggle} onDuplicate={onDuplicate} />)}</div>;
}

function WorkflowRow({ workflow, onSelect, onRun, onOpenBuilder, onAskAI, onDelete, onToggle, onDuplicate }) {
    const latestLog = workflow.latestLog;
    const status = workflow.isActive ? 'Active' : (workflow.status === 'Paused' ? 'Paused' : 'Draft');
    return <div onClick={() => onSelect(workflow.id)} className="group grid cursor-pointer gap-4 border-b border-slate-100 px-5 py-4 transition hover:bg-indigo-50/30 last:border-0 md:grid-cols-[minmax(220px,1.5fr)_100px_140px_130px_180px] md:items-center"><div className="flex min-w-0 items-center gap-3"><div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${workflow.iconBg || 'bg-indigo-50'} ${workflow.iconColor || 'text-indigo-600'}`}><WorkflowIcon size={19} /></div><div className="min-w-0"><p className="truncate text-sm font-bold text-slate-800">{workflow.name}</p><p className="mt-1 truncate text-xs text-slate-400">{getTriggerLabel(workflow)} · Updated {formatRelative(workflow.updatedAt)}</p></div></div><div><span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold ${status === 'Active' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : status === 'Paused' ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>{status}</span></div><div><span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold ${getHealthStyles(workflow.health)}`}>{workflow.health}</span></div><div className="text-xs font-medium text-slate-500">{latestLog ? formatRelative(latestLog.time) : 'Never run'}</div><div className="flex items-center justify-start gap-1 md:justify-end"><button type="button" onClick={event => { event.stopPropagation(); onRun(workflow); }} className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 px-2.5 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-100"><Play size={13} />Run</button><button type="button" onClick={event => { event.stopPropagation(); onAskAI(workflow.id, 'Explain this workflow in simple terms.'); }} className="rounded-lg p-2 text-indigo-500 hover:bg-indigo-50" title="Ask AI"><Bot size={15} /></button><button type="button" onClick={event => { event.stopPropagation(); onOpenBuilder(workflow.id); }} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Open builder"><ExternalLink size={15} /></button><button type="button" onClick={event => { event.stopPropagation(); onToggle(workflow); }} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title={workflow.isActive ? 'Pause' : 'Activate'}>{workflow.isActive ? <Pause size={15} /> : <Play size={15} />}</button><button type="button" onClick={event => { event.stopPropagation(); onDuplicate(workflow); }} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Duplicate"><Copy size={15} /></button><button type="button" onClick={event => { event.stopPropagation(); onDelete(workflow); }} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Delete"><Trash2 size={15} /></button></div></div>;
}
