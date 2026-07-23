import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import {
    ArrowRight,
    Check,
    FileText,
    Inbox,
    MessageSquareText,
    Play,
    Settings2,
    ShieldCheck,
    Sparkles,
    Workflow,
    Zap
} from 'lucide-react';
import { useCompleteOnboarding } from '../api/hooks/useAuth.js';
import { navigateTo } from '../utils/router.js';

gsap.registerPlugin(useGSAP);

const pages = [
    {
        label: 'Home',
        icon: Inbox,
        kicker: 'Your command centre',
        title: 'See what needs your attention.',
        body: 'Home brings together the health of your workspace, recent activity, and the next useful action so you can start from signal instead of noise.',
        accent: 'purple',
        points: [
            ['Workspace pulse', 'A quick read on active automations and recent runs.'],
            ['Recent activity', 'Jump back into the work that changed most recently.'],
            ['Shortcuts', 'Create a new automation or form without hunting through menus.']
        ],
        visual: 'home'
    },
    {
        label: 'Automations',
        icon: Workflow,
        kicker: 'Where work is shaped',
        title: 'Build work that runs.',
        body: 'Automations turn a trigger, a few decisions, and a set of actions into repeatable work your team can inspect and improve.',
        accent: 'teal',
        points: [
            ['Draft safely', 'Keep incomplete ideas unpublished while you work.'],
            ['Choose your editor', 'Describe the outcome with AI or shape the graph visually.'],
            ['Publish intentionally', 'Only the revision you publish is used by live triggers.']
        ],
        visual: 'automation'
    },
    {
        label: 'Forms',
        icon: FileText,
        kicker: 'Where context enters',
        title: 'Collect the right details.',
        body: 'Forms give people a clear way to send information in. Each response can become the beginning of an automation.',
        accent: 'gold',
        points: [
            ['Design the questions', 'Use fields that match the information your workflow needs.'],
            ['Keep responses together', 'Review submissions and their status from one place.'],
            ['Connect the next step', 'Use a form submission as a workflow trigger.']
        ],
        visual: 'form'
    },
    {
        label: 'Runs',
        icon: Play,
        kicker: 'Where outcomes are explained',
        title: 'Follow every execution.',
        body: 'Runs show what happened, which step produced it, and where attention is needed when something does not go as planned.',
        accent: 'blue',
        points: [
            ['Trace the path', 'See each node in execution order.'],
            ['Read the result', 'Inspect outputs, timing, and useful metadata.'],
            ['Recover with context', 'Failures keep their step and error details attached.']
        ],
        visual: 'runs'
    },
    {
        label: 'Approvals',
        icon: ShieldCheck,
        kicker: 'Where judgement stays human',
        title: 'Keep people in the loop.',
        body: 'Approval gates pause a workflow at the moment a person needs to decide. Your answer becomes an explicit path forward.',
        accent: 'rose',
        points: [
            ['Pause before action', 'Ask for a decision before a sensitive step runs.'],
            ['Choose a branch', 'Approve or reject with a clear next action on each path.'],
            ['Keep a record', 'The decision and its effect remain visible in the run.']
        ],
        visual: 'approval'
    },
    {
        label: 'Ask Promptly',
        icon: MessageSquareText,
        kicker: 'Where the workspace listens',
        title: 'Work in conversation.',
        body: 'Ask Promptly is the general assistant for understanding your workspace, refining a request, or getting to the right surface faster.',
        accent: 'purple',
        points: [
            ['Explain the outcome', 'Use plain language instead of memorising node names.'],
            ['Refine safely', 'The assistant proposes a reviewable plan before applying changes.'],
            ['Keep the context', 'Conversations stay tied to the work you are discussing.']
        ],
        visual: 'assistant'
    },
    {
        label: 'Settings',
        icon: Settings2,
        kicker: 'Where the environment is managed',
        title: 'Connect the environment.',
        body: 'Settings keeps account details and external connections in one predictable place, so the workspace knows what it can safely use.',
        accent: 'slate',
        points: [
            ['Account details', 'Manage the identity and security settings for your workspace.'],
            ['External connections', 'Connect the services your automations are allowed to use.'],
            ['Clear ownership', 'Resources and actions remain scoped to your account.']
        ],
        visual: 'settings'
    }
];

const accentClass = page => `is-${page.accent}`;

function TourVisual({ type, page }) {
    const node = (icon, label, meta) => <div className="onboarding-visual-node"><span>{icon}</span><div><strong>{label}</strong><small>{meta}</small></div><Check size={13} /></div>;
    if (type === 'home') return <div className="onboarding-visual-card"><div className="onboarding-visual-header"><span>Workspace pulse</span><i>Healthy</i></div><div className="onboarding-visual-metrics"><div><small>Active</small><strong>08</strong></div><div><small>Runs</small><strong>124</strong></div><div><small>Success</small><strong>98%</strong></div></div><div className="onboarding-visual-event"><span><Zap size={13} /></span><div><strong>All systems moving</strong><small>Updated just now</small></div></div></div>;
    if (type === 'form') return <div className="onboarding-visual-card onboarding-visual-form"><div className="onboarding-visual-header"><span>Job application</span><i>Draft</i></div><div className="onboarding-visual-input"><small>Full name</small><span>Jordan Lee</span></div><div className="onboarding-visual-input"><small>Email address</small><span>jordan@company.com</span></div><div className="onboarding-visual-input onboarding-visual-input-wide"><small>What should happen next?</small><span>Review this application</span></div><div className="onboarding-visual-button">Send response <ArrowRight size={13} /></div></div>;
    if (type === 'runs') return <div className="onboarding-visual-card onboarding-visual-run"><div className="onboarding-visual-header"><span>Candidate follow-up</span><i>Running</i></div><div className="onboarding-run-row"><span className="onboarding-run-icon"><Play size={12} /></span><div><strong>Form submitted</strong><small>complete · 0.4s</small></div><Check size={13} /></div><div className="onboarding-run-row"><span className="onboarding-run-icon"><ShieldCheck size={12} /></span><div><strong>Approval gate</strong><small>waiting for a decision</small></div><span className="onboarding-run-pending" /></div><div className="onboarding-run-row"><span className="onboarding-run-icon"><MessageSquareText size={12} /></span><div><strong>Send invitation</strong><small>next step</small></div><span className="onboarding-run-muted" /></div></div>;
    const nodes = { automation: [['◈', 'Form submitted', 'trigger'], ['◇', 'Review request', 'approval'], ['✦', 'Send invitation', 'email']], approval: [['◈', 'Application received', 'event'], ['◇', 'Your decision', 'approval'], ['✦', 'Next step', 'branch']], assistant: [['✦', 'Describe intent', 'conversation'], ['◇', 'Review plan', 'proposal'], ['◈', 'Apply changes', 'workspace']], settings: [['◈', 'Account', 'secure'], ['◇', 'Google connection', 'active'], ['✦', 'Workspace scope', 'ready']] };
    return <div className="onboarding-visual-card onboarding-visual-flow"><div className="onboarding-visual-header"><span>{page.label} flow</span><i>Reviewable</i></div>{nodes[type].map(([icon, label, meta], index) => <div key={label}>{node(icon, label, meta)}{index < nodes[type].length - 1 && <div className="onboarding-visual-connector" />}</div>)}</div>;
}

function TourPeek({ page, direction, onClick }) {
    const Icon = page.icon;
    return <button type="button" className={`onboarding-peek onboarding-peek-${direction}`} onClick={onClick} aria-label={`Go to ${page.label}`}>
        <span className="onboarding-peek-brand"><Icon size={16} /><strong>Promptly</strong></span>
        <span className="onboarding-peek-kicker">{page.kicker}</span>
        <strong className="onboarding-peek-title">{page.title}</strong>
        <span className="onboarding-peek-rule" />
        <span className="onboarding-peek-points">{page.points.map(([title]) => <span key={title}><Check size={11} />{title}</span>)}</span>
        <span className="onboarding-peek-footer">{direction === 'previous' ? '‹ Previous' : 'Next ›'}</span>
    </button>;
}

function TourCard({ page, stepIndex, isLastStep, isTransitioning, onboardingMutation, moveTo, next }) {
    return (
        <main className={`onboarding-card onboarding-simple-card ${accentClass(page)}`}>
            <div className="onboarding-card-head">
                <div>
                    <span className="onboarding-card-kicker">{page.kicker}</span>
                    <h1>{page.title}</h1>
                    <p>{page.body}</p>
                </div>
            </div>
            <div className="onboarding-content">
                <div className="onboarding-tour-page">
                    <div className="onboarding-tour-grid">
                        {page.points.map(([title, copy]) => (
                            <article key={title}>
                                <span className="onboarding-tour-check">
                                    <Check size={14} />
                                </span>
                                <div>
                                    <h3>{title}</h3>
                                    <p>{copy}</p>
                                </div>
                            </article>
                        ))}
                    </div>
                    <div className="onboarding-tour-visual">
                        <TourVisual type={page.visual} page={page} />
                    </div>
                </div>
                <div className="onboarding-note">
                    <Sparkles size={16} />
                    <span>
                        <strong>One workspace, one source of truth.</strong> You can return to {page.label} at any time from the navigation.
                    </span>
                </div>
                {onboardingMutation.isError && (
                    <p className="onboarding-error">
                        {onboardingMutation.error?.message || 'Could not complete the workspace tour.'}
                    </p>
                )}
            </div>
            <footer className="onboarding-footer">
                <button
                    type="button"
                    onClick={() => moveTo(Math.max(1, stepIndex - 1))}
                    disabled={stepIndex === 1 || onboardingMutation.isPending || isTransitioning}
                    className="onboarding-back"
                >
                    Back
                </button>
                <button
                    type="button"
                    onClick={next}
                    disabled={onboardingMutation.isPending || isTransitioning}
                    className="onboarding-next"
                >
                    {onboardingMutation.isPending
                        ? 'Opening workspace…'
                        : isLastStep
                        ? 'Finish tour'
                        : `Next: ${pages[stepIndex]?.label}`}
                    <ArrowRight size={16} />
                </button>
            </footer>
        </main>
    );
}

export default function OnboardingPage({ onOnboardingComplete }) {
    const [step, setStep] = useState(1);
    const [transitionDirection, setTransitionDirection] = useState(1);
    const [pendingStep, setPendingStep] = useState(null);
    const [isTransitioning, setIsTransitioning] = useState(false);

    const carouselRef = useRef(null);
    const previousCellRef = useRef(null);
    const cardSlotRef = useRef(null);
    const nextCellRef = useRef(null);
    const outgoingCardRef = useRef(null);
    const incomingCardRef = useRef(null);

    const onboardingMutation = useCompleteOnboarding();

    const currentStep = step;
    const activeStep = isTransitioning && pendingStep != null ? pendingStep : step;
    const page = pages[currentStep - 1];
    const activePage = pages[activeStep - 1];

    const previousPage = isTransitioning && pendingStep != null
        ? pages[pendingStep - 2]
        : pages[currentStep - 2];
    const nextPage = isTransitioning && pendingStep != null
        ? pages[pendingStep]
        : pages[currentStep];

    const isLastStep = activeStep === pages.length;
    const Icon = activePage.icon;

    useGSAP((_, contextSafe) => {
        if (!isTransitioning || pendingStep == null) return;

        const carousel = carouselRef.current;
        if (!carousel) return;

        const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        const finishTransition = contextSafe(() => {
            setStep(pendingStep);
            setPendingStep(null);
            setIsTransitioning(false);
        });

        if (reducedMotion) {
            finishTransition();
            return;
        }

        const dir = transitionDirection;
        const timeline = gsap.timeline({
            defaults: { overwrite: 'auto' },
            onComplete: finishTransition
        });

        const xOffset = dir > 0 ? 80 : -80;

        if (outgoingCardRef.current && incomingCardRef.current) {
            timeline.fromTo(outgoingCardRef.current,
                { x: 0, opacity: 1, scale: 1 },
                { x: -xOffset, opacity: 0, scale: 0.96, duration: 0.42, ease: 'power3.inOut' },
                0
            );
            timeline.fromTo(incomingCardRef.current,
                { x: xOffset, opacity: 0, scale: 0.96 },
                { x: 0, opacity: 1, scale: 1, duration: 0.42, ease: 'power3.out' },
                0
            );
        }

        if (previousCellRef.current) {
            timeline.fromTo(previousCellRef.current,
                { x: dir > 0 ? 30 : -30, opacity: 0.4, scale: 0.92 },
                { x: 0, opacity: 1, scale: 1, duration: 0.38, ease: 'power2.out' },
                0.04
            );
        }

        if (nextCellRef.current) {
            timeline.fromTo(nextCellRef.current,
                { x: dir > 0 ? 30 : -30, opacity: 0.4, scale: 0.92 },
                { x: 0, opacity: 1, scale: 1, duration: 0.38, ease: 'power2.out' },
                0.04
            );
        }
    }, { scope: carouselRef, dependencies: [isTransitioning, pendingStep, transitionDirection], revertOnUpdate: true });

    const finish = async () => {
        try {
            const response = await onboardingMutation.mutateAsync();
            onOnboardingComplete?.(response.user);
            navigateTo({ page: 'home' });
        } catch {
            // The mutation error is shown in the footer.
        }
    };

    const moveTo = targetStep => {
        if (targetStep === step || isTransitioning) return;
        setTransitionDirection(targetStep > step ? 1 : -1);
        setPendingStep(targetStep);
        setIsTransitioning(true);
    };

    const next = () => isLastStep ? finish() : moveTo(Math.min(pages.length, activeStep + 1));

    useEffect(() => {
        const handleKeyDown = e => {
            if (isTransitioning || onboardingMutation.isPending) return;
            if (e.key === 'ArrowRight') {
                if (!isLastStep) {
                    moveTo(step + 1);
                } else {
                    finish();
                }
            } else if (e.key === 'ArrowLeft') {
                if (step > 1) {
                    moveTo(step - 1);
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [step, isTransitioning, isLastStep, onboardingMutation.isPending]);

    return <div className="onboarding-screen onboarding-tour-screen">
        <div className="onboarding-ambient onboarding-ambient-one" />
        <div className="onboarding-ambient onboarding-ambient-two" />
        <div className="onboarding-inner onboarding-simple-inner">
            <header className="onboarding-topbar">
                <div className="onboarding-brand"><img src="/logo.png" alt="Promptly" /><span>Promptly<span>.</span></span></div>
                <div className="onboarding-top-actions"><span><span className="onboarding-live-dot" /> Workspace tour</span><button type="button" onClick={finish} disabled={onboardingMutation.isPending}>Skip tour</button></div>
            </header>
            <div className="onboarding-simple-meta">
                <div className="onboarding-surface-label"><span className="onboarding-surface-icon"><Icon size={17} /></span><span><small>Now exploring</small><strong>{activePage.label}</strong></span></div>
                <div className="onboarding-progress onboarding-progress-wide"><div><i style={{ width: `${(activeStep / pages.length) * 100}%` }} /></div><small>{activeStep} of {pages.length} pages</small></div>
            </div>
            <div ref={carouselRef} className="onboarding-carousel" aria-label="Workspace tour pages" aria-busy={isTransitioning}>
                <div ref={previousCellRef} className="onboarding-carousel-cell onboarding-carousel-cell-previous">
                    {previousPage ? <TourPeek page={previousPage} direction="previous" onClick={() => moveTo(Math.max(1, activeStep - 1))} /> : <div className="onboarding-peek-placeholder" />}
                </div>
                <div ref={cardSlotRef} className="onboarding-card-slot">
                    {!isTransitioning || pendingStep == null ? (
                        <TourCard
                            page={page}
                            stepIndex={step}
                            isLastStep={step === pages.length}
                            isTransitioning={false}
                            onboardingMutation={onboardingMutation}
                            moveTo={moveTo}
                            next={next}
                        />
                    ) : (
                        <>
                            <div ref={outgoingCardRef} style={{ width: '100%', height: '100%' }}>
                                <TourCard
                                    page={pages[step - 1]}
                                    stepIndex={step}
                                    isLastStep={step === pages.length}
                                    isTransitioning={true}
                                    onboardingMutation={onboardingMutation}
                                    moveTo={moveTo}
                                    next={next}
                                />
                            </div>
                            <div ref={incomingCardRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
                                <TourCard
                                    page={pages[pendingStep - 1]}
                                    stepIndex={pendingStep}
                                    isLastStep={pendingStep === pages.length}
                                    isTransitioning={true}
                                    onboardingMutation={onboardingMutation}
                                    moveTo={moveTo}
                                    next={next}
                                />
                            </div>
                        </>
                    )}
                </div>
                <div ref={nextCellRef} className="onboarding-carousel-cell onboarding-carousel-cell-next">
                    {nextPage ? <TourPeek page={nextPage} direction="next" onClick={() => moveTo(Math.min(pages.length, activeStep + 1))} /> : <div className="onboarding-peek-placeholder" />}
                </div>
            </div>
        </div>
    </div>;
}

