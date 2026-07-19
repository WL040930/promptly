import { useMemo, useState } from 'react';
import { ClipboardCheck, Rocket, Target, Workflow } from 'lucide-react';
import { useCompleteOnboarding } from '../api/hooks/useAuth.js';
import { navigateTo } from '../utils/router.js';

const steps = [
    { label: 'What Promptly does', shortLabel: 'Overview' },
    { label: 'Your workspace', shortLabel: 'Workspace' },
    { label: 'Two ways to build', shortLabel: 'Build' },
    { label: 'From draft to live', shortLabel: 'Lifecycle' },
    { label: 'Create your first automation', shortLabel: 'Start' }
];

const starters = [
    'Follow up after a form submission',
    'Send a notification when something changes',
    'Create a scheduled report',
    'Process incoming requests'
];

function StepBadge({ number, active, completed }) {
    return (
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-extrabold ${completed ? 'bg-emerald-500 text-white' : active ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
            {completed ? '✓' : number}
        </span>
    );
}

function FlowArrow() {
    return <span className="hidden text-2xl font-light text-slate-300 md:block">→</span>;
}

function ConceptCard({ icon, title, children, tone = 'slate' }) {
    const tones = {
        indigo: 'border-indigo-100 bg-indigo-50/60',
        cyan: 'border-cyan-100 bg-cyan-50/60',
        amber: 'border-amber-100 bg-amber-50/60',
        emerald: 'border-emerald-100 bg-emerald-50/60',
        slate: 'border-slate-200 bg-slate-50'
    };
    return (
        <div className={`rounded-2xl border p-5 ${tones[tone] || tones.slate}`}>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/80 text-slate-700" aria-hidden="true">{icon}</div>
            <h3 className="mt-3 text-sm font-extrabold text-slate-900">{title}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">{children}</p>
        </div>
    );
}

function WorkspaceItem({ icon, name, description }) {
    return (
        <div className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-lg" aria-hidden="true">{icon}</span>
            <div>
                <h3 className="text-sm font-extrabold text-slate-900">{name}</h3>
                <p className="mt-1 text-sm leading-5 text-slate-500">{description}</p>
            </div>
        </div>
    );
}

export default function OnboardingPage({ onOnboardingComplete }) {
    const [goal, setGoal] = useState('');
    const [method, setMethod] = useState('ai');
    const [step, setStep] = useState(1);
    const onboardingMutation = useCompleteOnboarding();
    const currentStep = steps[step - 1];
    const isLastStep = step === steps.length;

    const canContinue = useMemo(() => !onboardingMutation.isPending, [onboardingMutation.isPending]);

    const finish = async () => {
        try {
            const response = await onboardingMutation.mutateAsync();
            if (goal.trim()) window.localStorage.setItem('promptly.onboarding-goal', goal.trim());
            onOnboardingComplete?.(response.user);
            navigateTo({ page: 'automation-new', method });
        } catch {
            // The mutation error is shown in the final step.
        }
    };

    const next = () => {
        if (isLastStep) finish();
        else setStep(value => Math.min(steps.length, value + 1));
    };

    return (
        <div className="min-h-screen bg-[#f7f9fc] px-4 py-5 font-sans text-slate-900 sm:px-6 lg:h-screen lg:overflow-hidden lg:px-8 lg:py-6">
            <div className="mx-auto flex h-full w-full max-w-[1440px] flex-col">
                <header className="flex items-center justify-between px-1">
                    <div className="flex items-center gap-2">
                        <img src="/logo.png" alt="Promptly" className="h-9 w-9 rounded-xl" />
                        <span className="text-xl font-bold tracking-tight text-indigo-600">Promptly</span>
                    </div>
                    <span className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Getting started guide</span>
                </header>

                <div className="mt-6 grid min-h-0 flex-1 gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
                    <aside className="h-fit rounded-3xl border border-slate-200 bg-white p-4 shadow-sm lg:overflow-y-auto">
                        <p className="px-3 pb-4 text-xs font-extrabold uppercase tracking-[0.16em] text-slate-400">Before you begin</p>
                        <div className="space-y-1">
                            {steps.map((item, index) => {
                                const number = index + 1;
                                return (
                                    <button key={item.label} type="button" onClick={() => setStep(number)} className={`flex w-full items-center gap-3 rounded-2xl p-3 text-left transition ${number === step ? 'bg-indigo-50 text-indigo-700' : number < step ? 'text-slate-600 hover:bg-slate-50' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}>
                                        <StepBadge number={number} active={number === step} completed={number < step} />
                                        <span className="text-sm font-bold">{item.shortLabel}</span>
                                    </button>
                                );
                            })}
                        </div>
                        <div className="mt-5 rounded-2xl bg-slate-50 p-4 text-xs leading-5 text-slate-500">
                            This guide explains the core ideas before you create anything. You can revisit the same concepts later from the workspace.
                        </div>
                    </aside>

                    <main className="flex min-h-0 flex-col overflow-hidden rounded-[2rem] border border-slate-200 bg-white p-6 shadow-xl shadow-slate-900/5 md:p-10 xl:p-12">
                        <div className="flex items-start justify-between gap-6 border-b border-slate-100 pb-6">
                            <div>
                                <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-indigo-500">Step {step} of {steps.length}</p>
                                <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">{currentStep.label}</h1>
                            </div>
                            <div className="hidden rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-500 sm:block">{Math.round((step / steps.length) * 100)}% complete</div>
                        </div>

                        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                        {step === 1 && (
                            <div className="pt-8">
                                <p className="max-w-3xl text-lg leading-8 text-slate-600">Promptly helps you turn a desired outcome into a repeatable automation. An automation listens for a trigger, performs steps, and records what happened.</p>
                                <div className="mt-7 rounded-2xl border border-indigo-100 bg-indigo-50/70 p-5"><h2 className="text-sm font-extrabold text-indigo-950">Focus on the outcome first</h2><p className="mt-2 text-sm leading-6 text-indigo-900">You do not need to understand every node or setting before you begin. Start by deciding what should happen, then use the workspace to shape and verify the steps.</p></div>
                                <div className="mt-8 grid gap-3 md:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] md:items-center">
                                    <ConceptCard icon={<Target size={22} strokeWidth={2} />} title="Choose an outcome" tone="indigo">Start with the result you want, such as “notify my team when a new request arrives.”</ConceptCard>
                                    <FlowArrow />
                                    <ConceptCard icon={<Workflow size={22} strokeWidth={2} />} title="Build the steps" tone="cyan">Add the trigger, conditions, data handling, and actions needed to produce that result.</ConceptCard>
                                    <FlowArrow />
                                    <ConceptCard icon={<ClipboardCheck size={22} strokeWidth={2} />} title="Review and test" tone="amber">Inspect the proposed steps, correct anything unsafe, and run a test with sample data before activating it.</ConceptCard>
                                    <FlowArrow />
                                    <ConceptCard icon={<Rocket size={22} strokeWidth={2} />} title="Publish and monitor" tone="emerald">Publishing makes the automation live. Every run is recorded so you can see success, errors, timing, and output.</ConceptCard>
                                </div>
                                <div className="mt-8 rounded-2xl border border-indigo-100 bg-indigo-50/60 p-5">
                                    <h2 className="text-sm font-extrabold text-indigo-900">Your role</h2>
                                    <p className="mt-2 text-sm leading-6 text-indigo-800">Promptly can help create the draft, but you decide what the automation does, when it goes live, and whether it should remain active.</p>
                                </div>
                            </div>
                        )}

                        {step === 2 && (
                            <div className="pt-8">
                                <p className="max-w-3xl text-lg leading-8 text-slate-600">The workspace is organized around the things you create and operate. These sections are connected, but each has a different job.</p>
                                <div className="mt-8 grid gap-3 md:grid-cols-2">
                                    <WorkspaceItem icon="⌂" name="Home" description="Your starting point: a summary of your automations, recent activity, and useful shortcuts." />
                                    <WorkspaceItem icon="⤢" name="Automations" description="The main library of automations. Create, open, duplicate, publish, pause, or delete them here." />
                                    <WorkspaceItem icon="▤" name="Forms" description="Create forms that collect information. A form submission can become the trigger for an automation." />
                                    <WorkspaceItem icon="›_" name="Runs" description="Review execution history: whether a run succeeded, where it failed, how long it took, and what it produced." />
                                    <WorkspaceItem icon="✦" name="Ask Promptly" description="Use the assistant for general questions or to work on a specific automation when you provide its context." />
                                    <WorkspaceItem icon="⚙" name="Settings" description="Manage your account, password, and external connections such as Google services." />
                                </div>
                                <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-5">
                                    <h2 className="text-sm font-extrabold text-slate-900">A typical path</h2>
                                    <p className="mt-2 text-sm leading-6 text-slate-600"><span className="font-bold text-indigo-600">Automations</span> → open an automation → <span className="font-bold text-indigo-600">Build</span> → test it → <span className="font-bold text-indigo-600">Publish</span> → inspect it later in <span className="font-bold text-indigo-600">Runs</span>.</p>
                                </div>
                            </div>
                        )}

                        {step === 3 && (
                            <div className="pt-8">
                                <p className="max-w-3xl text-lg leading-8 text-slate-600">AI and Visual Builder are not two different products or two different kinds of automation. They are two editing surfaces for the same automation.</p>
                                <div className="mt-8 grid gap-5 md:grid-cols-2">
                                    <div className={`rounded-3xl border-2 p-6 ${method === 'ai' ? 'border-indigo-400 bg-indigo-50/50' : 'border-slate-200 bg-white'}`}>
                                        <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-xl">✦</span><div><h2 className="text-lg font-extrabold text-slate-900">AI editor</h2><p className="text-xs font-bold uppercase tracking-wider text-indigo-600">Best for describing intent</p></div></div>
                                        <ul className="mt-5 space-y-3 text-sm leading-6 text-slate-600"><li><span className="mr-2 font-bold text-indigo-600">1.</span>Explain what you want to happen.</li><li><span className="mr-2 font-bold text-indigo-600">2.</span>Promptly proposes nodes, connections, and configuration.</li><li><span className="mr-2 font-bold text-indigo-600">3.</span>Ask follow-up questions or request changes.</li></ul>
                                        <p className="mt-5 rounded-xl bg-white/80 p-3 text-xs leading-5 text-slate-500">Example: “When a form is submitted, summarize the response and email it to my team.”</p>
                                    </div>
                                    <div className="rounded-3xl border-2 border-slate-200 bg-white p-6">
                                        <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-100 text-xl">⌘</span><div><h2 className="text-lg font-extrabold text-slate-900">Visual editor</h2><p className="text-xs font-bold uppercase tracking-wider text-cyan-700">Best for inspecting structure</p></div></div>
                                        <ul className="mt-5 space-y-3 text-sm leading-6 text-slate-600"><li><span className="mr-2 font-bold text-cyan-700">1.</span>Place triggers and action nodes on the canvas.</li><li><span className="mr-2 font-bold text-cyan-700">2.</span>Connect branches, conditions, and error paths.</li><li><span className="mr-2 font-bold text-cyan-700">3.</span>Open each node to configure its details.</li></ul>
                                        <p className="mt-5 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-500">Use it when you need precise control over order, branching, data mapping, or recovery behavior.</p>
                                    </div>
                                </div>
                                <div className="mt-7 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-5"><h2 className="text-sm font-extrabold text-emerald-900">You can switch later</h2><p className="mt-2 text-sm leading-6 text-emerald-800">Starting with AI does not lock you into AI. Starting visually does not remove the assistant. Both editors read and update the same draft and revisions.</p></div>
                            </div>
                        )}

                        {step === 4 && (
                            <div className="pt-8">
                                <p className="max-w-3xl text-lg leading-8 text-slate-600">Promptly separates editing from execution so you can make changes safely and understand what is live.</p>
                                <div className="mt-8 space-y-4">
                                    <div className="flex gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-5"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-200 text-sm font-extrabold text-slate-700">1</span><div><h2 className="font-extrabold text-slate-900">Draft</h2><p className="mt-1 text-sm leading-6 text-slate-600">Your edits are saved as a draft revision. A draft can be incomplete while you are still designing it.</p></div></div>
                                    <div className="flex gap-4 rounded-2xl border border-amber-100 bg-amber-50/60 p-5"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-200 text-sm font-extrabold text-amber-800">2</span><div><h2 className="font-extrabold text-slate-900">Test</h2><p className="mt-1 text-sm leading-6 text-slate-600">Run the current draft with sample input. Check node results, output, errors, and whether the data is mapped as expected.</p></div></div>
                                    <div className="flex gap-4 rounded-2xl border border-indigo-100 bg-indigo-50/60 p-5"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-200 text-sm font-extrabold text-indigo-800">3</span><div><h2 className="font-extrabold text-slate-900">Publish</h2><p className="mt-1 text-sm leading-6 text-slate-600">Publishing marks the selected revision as live. Real triggers use the published revision, not an unfinished draft.</p></div></div>
                                    <div className="flex gap-4 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-5"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-200 text-sm font-extrabold text-emerald-800">4</span><div><h2 className="font-extrabold text-slate-900">Monitor</h2><p className="mt-1 text-sm leading-6 text-slate-600">Use Runs to investigate each execution. If needed, pause the automation, edit a new draft, test again, and republish.</p></div></div>
                                </div>
                                <div className="mt-7 rounded-2xl border border-red-100 bg-red-50/70 p-5"><h2 className="text-sm font-extrabold text-red-900">What happens when something fails?</h2><p className="mt-2 text-sm leading-6 text-red-800">The run is recorded as failed with the step and error details. The automation does not silently change itself or publish an AI repair without your approval.</p></div>
                            </div>
                        )}

                        {step === 5 && (
                            <div className="pt-8">
                                <p className="max-w-3xl text-lg leading-8 text-slate-600">Now choose a real outcome to use while you learn. You can change the draft before publishing it.</p>
                                <label className="mt-7 block text-sm font-extrabold text-slate-800" htmlFor="onboarding-goal">What do you want your first automation to do?</label>
                                <textarea id="onboarding-goal" value={goal} onChange={event => setGoal(event.target.value)} rows={4} placeholder="For example: When a new form response arrives, summarize it and notify my team…" className="mt-3 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-800 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-100" />
                                <div className="mt-4 grid gap-2 sm:grid-cols-2">{starters.map(starter => <button key={starter} type="button" onClick={() => setGoal(starter)} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-sm font-semibold text-slate-600 transition hover:border-indigo-300 hover:bg-indigo-50/50 hover:text-indigo-700">{starter}</button>)}</div>
                                <h2 className="mt-8 text-sm font-extrabold text-slate-800">Choose where to begin</h2>
                                <div className="mt-3 grid gap-3 md:grid-cols-2">
                                    <button type="button" onClick={() => setMethod('ai')} className={`rounded-2xl border-2 p-5 text-left transition ${method === 'ai' ? 'border-indigo-500 bg-indigo-50/60' : 'border-slate-200 hover:border-indigo-200'}`}><div className="flex items-center justify-between"><span className="text-xl">✦</span>{method === 'ai' && <span className="text-xs font-extrabold text-indigo-600">SELECTED</span>}</div><h3 className="mt-3 font-extrabold text-slate-900">Describe it with AI</h3><p className="mt-1 text-sm leading-5 text-slate-500">Start from your written goal and review the proposed automation.</p></button>
                                    <button type="button" onClick={() => setMethod('visual')} className={`rounded-2xl border-2 p-5 text-left transition ${method === 'visual' ? 'border-indigo-500 bg-indigo-50/60' : 'border-slate-200 hover:border-indigo-200'}`}><div className="flex items-center justify-between"><span className="text-xl">⌘</span>{method === 'visual' && <span className="text-xs font-extrabold text-indigo-600">SELECTED</span>}</div><h3 className="mt-3 font-extrabold text-slate-900">Build it on the canvas</h3><p className="mt-1 text-sm leading-5 text-slate-500">Start with an empty automation and place the steps yourself.</p></button>
                                </div>
                                {onboardingMutation.isError && <p className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{onboardingMutation.error?.message || 'Could not complete onboarding.'}</p>}
                            </div>
                        )}
                        </div>

                        <footer className="mt-6 flex shrink-0 items-center justify-between border-t border-slate-100 pt-6">
                            <button type="button" onClick={() => setStep(value => Math.max(1, value - 1))} disabled={step === 1 || onboardingMutation.isPending} className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:invisible">Back</button>
                            <button type="button" onClick={next} disabled={!canContinue} className="rounded-xl bg-indigo-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-500/20 hover:bg-indigo-700 disabled:cursor-wait disabled:opacity-60">{onboardingMutation.isPending ? 'Starting…' : isLastStep ? 'Start my first automation' : 'Continue'}</button>
                        </footer>
                    </main>
                </div>
            </div>
        </div>
    );
}
