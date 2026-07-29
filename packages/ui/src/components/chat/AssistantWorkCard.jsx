import { useMemo, useState } from 'react';
import { Check, ChevronDown, CircleAlert, FilePenLine, LoaderCircle, Sparkles, Wrench, Zap } from 'lucide-react';

const phases = [
    { id: 'understand', label: 'Understand' },
    { id: 'plan', label: 'Plan' },
    { id: 'draft', label: 'Draft' },
    { id: 'check', label: 'Check' }
];

const terminal = new Set(['awaiting_review', 'needs_input', 'completed', 'failed', 'applied', 'ignored']);
const duration = (start, end) => {
    if (!start || !end) return null;
    const seconds = Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000));
    return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
};

const phaseState = (phase, current, isTerminal) => {
    const activeIndex = phases.findIndex(item => item.id === current);
    const index = phases.findIndex(item => item.id === phase.id);
    if (isTerminal || index < activeIndex) return 'done';
    if (index === activeIndex) return 'active';
    return 'waiting';
};

export function AssistantWorkDetails({ work, tokenUsage, defaultExpanded = false, label = 'Preparation details' }) {
    const [expanded, setExpanded] = useState(defaultExpanded);
    const activities = work?.activities || [];
    const repairCount = activities.filter(activity => /repair|correct|recover|retry/i.test(`${activity.label} ${activity.detail}`)).length;
    const artifact = work?.currentArtifact || work?.artifacts?.at(-1);
    const summary = useMemo(() => [
        `${activities.length} ${activities.length === 1 ? 'step' : 'steps'}`,
        repairCount ? `${repairCount} ${repairCount === 1 ? 'correction' : 'corrections'}` : null,
        duration(work?.startedAt, work?.completedAt)
    ].filter(Boolean).join(' · '), [activities.length, repairCount, work?.startedAt, work?.completedAt]);

    if (!work) return null;

    return (
        <section className="overflow-hidden rounded-xl border border-violet-100 bg-white/75">
            <button type="button" onClick={() => setExpanded(value => !value)} className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-xs font-semibold text-slate-500 transition hover:bg-violet-50 hover:text-violet-800" aria-expanded={expanded}>
                <span className="min-w-0 truncate">{label} · {summary || 'In progress'}{tokenUsage?.totalTokens ? <span className="ml-2 inline-flex items-center gap-1 text-slate-400"><Zap size={11} className="text-amber-500" />{tokenUsage.totalTokens.toLocaleString()} tokens</span> : null}</span>
                <ChevronDown size={15} className={`shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} />
            </button>
            {expanded && <div className="border-t border-violet-100 px-3 py-3">
                {artifact?.items?.length > 0 && <div className="mb-3 rounded-xl border border-violet-100 bg-violet-50/55 px-3 py-2.5"><p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-violet-700">{artifact.title}</p><ul className="mt-1.5 space-y-1">{artifact.items.map((item, index) => <li key={`${artifact.id}-${index}`} className="flex gap-2 text-xs leading-4 text-slate-700"><span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-violet-500" />{item}</li>)}</ul></div>}
                <ol className="relative space-y-3 border-l border-violet-100 pl-4">
                    {activities.map((activity, index) => <li key={`${activity.id}-${index}`} className="relative">
                        <span className={`absolute -left-[21px] top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 ${activity.status === 'active' ? 'border-violet-600 bg-white shadow-[0_0_0_3px_rgba(109,74,255,0.1)]' : activity.status === 'failed' ? 'border-rose-500 bg-rose-50' : 'border-emerald-500 bg-emerald-500'}`}>{activity.status === 'completed' && <Check size={8} className="text-white" strokeWidth={3} />}{activity.status === 'active' && <span className="h-1.5 w-1.5 rounded-full bg-violet-600 motion-safe:animate-pulse" />}</span>
                        <div className="flex items-start gap-2"><span className="min-w-0 flex-1 text-xs font-bold text-slate-800">{activity.label}{activity.attempt > 1 ? <span className="ml-1.5 text-[10px] font-semibold text-violet-600">Attempt {activity.attempt}</span> : null}</span>{/repair|correct|recover|retry/i.test(`${activity.label} ${activity.detail}`) && <Wrench size={13} className="mt-0.5 shrink-0 text-violet-500" />}</div>
                        {activity.detail && activity.detail !== activity.label && <p className="mt-0.5 text-[11px] leading-4 text-slate-500">{activity.detail}</p>}
                    </li>)}
                </ol>
            </div>}
        </section>
    );
}

export default function AssistantWorkCard({ work, tokenUsage }) {
    const isTerminal = terminal.has(work?.status);
    const activities = work?.activities || [];
    const active = activities.find(activity => activity.status === 'active') || activities.at(-1);
    const statusLabel = work?.status === 'failed' ? 'Couldn’t finish' : isTerminal ? 'Ready to review' : 'Drafting';

    return (
        <section className="w-full min-w-0 overflow-hidden rounded-[22px] border border-violet-200/80 bg-white shadow-[0_12px_35px_rgba(58,34,118,0.08)]">
            <header className="border-b border-violet-100 bg-[radial-gradient(circle_at_top_left,_rgba(126,87,255,0.17),_transparent_48%),linear-gradient(135deg,#f8f7ff,#fff)] px-4 py-4">
                <div className="flex items-start gap-3">
                    <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-violet-200 bg-violet-100 text-violet-700">
                        {!isTerminal && <span className="absolute inset-[-3px] rounded-[18px] border-2 border-violet-400 border-t-transparent motion-safe:animate-spin" />}
                        {work?.surface === 'form' ? <FilePenLine size={17} strokeWidth={2.2} /> : <Sparkles size={17} strokeWidth={2.2} />}
                    </span>
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                            <span className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-violet-700">{work?.surface === 'form' ? 'Form proposal' : 'Workflow proposal'}</span>
                            <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-bold ${work?.status === 'failed' ? 'bg-rose-100 text-rose-700' : 'bg-violet-600 text-white'}`}>
                                {work?.status === 'failed' ? <CircleAlert size={12} /> : <LoaderCircle size={12} className="motion-safe:animate-spin" />}
                                {statusLabel}
                            </span>
                        </div>
                        <p className="mt-1 truncate text-sm font-bold text-slate-900">{work?.title || 'Preparing your proposal'}</p>
                        <p className="mt-2 flex items-center gap-1.5 text-xs font-bold text-violet-900"><span className="h-1.5 w-1.5 rounded-full bg-violet-600 motion-safe:animate-pulse" />{active?.label || 'Preparing the proposal'}</p>
                        <p className="mt-1 text-xs leading-5 text-slate-600">{active?.detail || 'Preparing the proposed changes…'}</p>
                    </div>
                </div>
                <div className="mt-4 grid grid-cols-4 gap-0" aria-label="Proposal progress">
                    {phases.map((phase, index) => {
                        const state = phaseState(phase, work?.currentPhase || 'understand', isTerminal);
                        return <div key={phase.id} className="relative min-w-0 text-center">
                            {index > 0 && <span className={`absolute right-1/2 top-[7px] h-px w-full ${state === 'waiting' ? 'bg-violet-200' : 'bg-violet-500'}`} />}
                            <span className={`relative z-10 mx-auto flex h-[15px] w-[15px] items-center justify-center rounded-full border-2 ${state === 'done' ? 'border-violet-600 bg-violet-600' : state === 'active' ? 'border-violet-600 bg-white shadow-[0_0_0_4px_rgba(109,74,255,0.13)]' : 'border-violet-200 bg-white'}`}>{state === 'done' && <Check size={9} className="text-white" strokeWidth={3} />}</span>
                            <span className={`mt-1.5 block truncate text-[9px] font-bold ${state === 'waiting' ? 'text-slate-400' : 'text-violet-800'}`}>{phase.label}</span>
                        </div>;
                    })}
                </div>
            </header>
            <div className="bg-slate-50/45 p-3.5">
                <AssistantWorkDetails work={work} tokenUsage={tokenUsage} defaultExpanded label="Proposal progress" />
            </div>
        </section>
    );
}
