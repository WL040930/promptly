import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getOnboardingContext } from '../api/onboarding.js';
import { useCompleteOnboarding } from '../api/hooks/useAuth.js';
import { useWorkspaceScope } from '../context/WorkspaceScopeContext.jsx';
import { navigateTo } from '../utils/router.js';

const steps = [
    {
        target: 'dashboard-overview',
        route: { page: 'home' },
        eyebrow: 'See the whole picture',
        title: 'Your workspace starts here',
        body: 'The Home view turns automation activity into a quick read: what is running, what needs attention, and where to go next.'
    },
    {
        target: 'automations',
        route: { page: 'automations' },
        eyebrow: 'Shape the work',
        title: 'Build an automation',
        body: 'Automations describe the steps Promptly should take. In the sample workspace, open the triage example to see input, AI, approval, and logging connected together.'
    },
    {
        target: 'forms',
        route: { page: 'forms' },
        eyebrow: 'Start with good input',
        title: 'Collect the information you need',
        body: 'Forms turn requests into structured data. A form can be the first step of an automation, so the work starts with a clear shape.'
    },
    {
        target: 'monitoring',
        route: { page: 'runs' },
        eyebrow: 'Review what happened',
        title: 'Monitor every run',
        body: 'Runs show successful work, failures, and pauses. Use the details to understand a result before changing the automation.'
    },
    {
        target: 'assistant',
        route: { page: 'assistant' },
        eyebrow: 'Work with a guide',
        title: 'Ask Promptly for help',
        body: 'The assistant can explain the workspace, help shape a request, and prepare changes for your review before anything is applied.'
    },
    {
        target: 'help',
        route: { page: 'home' },
        eyebrow: 'Come back any time',
        title: 'Replay this tutorial from Help',
        body: 'The question-mark button in the workspace navigation reopens this guide. Sample data is read-only, so you can explore without changing your real workspace.'
    }
];

const mobileNavigationTargets = new Set(['automations', 'forms', 'monitoring', 'assistant', 'help']);
const tourStorageKey = (userId, scope) => `promptly.workspace-tour.${userId || 'guest'}.${scope || 'live'}`;

function getSavedStep(userId, scope) {
    try {
        const value = Number(window.sessionStorage.getItem(tourStorageKey(userId, scope)));
        return Number.isInteger(value) && value >= 0 && value < steps.length ? value : 0;
    } catch {
        return 0;
    }
}

export default function WorkspaceTour({ user, onOnboardingComplete, autoStart = false }) {
    const { scope, isDemo, startDemo, exitDemo } = useWorkspaceScope();
    const [isOpen, setIsOpen] = useState(false);
    const [phase, setPhase] = useState('closed');
    const [stepIndex, setStepIndex] = useState(() => getSavedStep(user?.id, scope));
    const [rect, setRect] = useState(null);
    const [error, setError] = useState('');
    const [isStartingDemo, setIsStartingDemo] = useState(false);
    const dialogRef = useRef(null);
    const autoStartedRef = useRef(false);
    const completeOnboarding = useCompleteOnboarding();
    const { data: onboardingContext } = useQuery({
        queryKey: ['onboardingContext', user?.id],
        queryFn: getOnboardingContext,
        enabled: Boolean(user?.id),
        staleTime: 60_000
    });
    const isFirstRun = !user?.onboardingCompletedAt;
    const step = steps[stepIndex] || steps[0];

    const closeWithoutCompletion = () => {
        setIsOpen(false);
        setPhase('closed');
        setRect(null);
    };

    const finish = async () => {
        if (completeOnboarding.isPending) return;
        setError('');
        if (!isFirstRun) {
            closeWithoutCompletion();
            return;
        }
        try {
            const response = await completeOnboarding.mutateAsync();
            try {
                window.sessionStorage.removeItem(tourStorageKey(user?.id, scope));
            } catch { /* Session storage is best effort. */ }
            onOnboardingComplete?.(response.user);
            closeWithoutCompletion();
            navigateTo({ page: 'home' });
        } catch (completionError) {
            setError(completionError.message || 'We could not save your onboarding progress. Please try again.');
        }
    };

    const beginDemo = async () => {
        if (isStartingDemo) return;
        setError('');
        setIsStartingDemo(true);
        try {
            await startDemo();
            setStepIndex(0);
            setPhase('tour');
            setIsOpen(true);
        } catch (demoError) {
            setError(demoError.message || 'We could not prepare the sample workspace. Please try again.');
        } finally {
            setIsStartingDemo(false);
        }
    };

    const beginLive = () => {
        setError('');
        if (isDemo) exitDemo();
        setStepIndex(0);
        setPhase('tour');
        setIsOpen(true);
    };

    useEffect(() => {
        if (!autoStart || autoStartedRef.current) return;
        autoStartedRef.current = true;
        setPhase('welcome');
        setIsOpen(true);
    }, [autoStart]);

    useEffect(() => {
        const onTutorialRequest = event => {
            const requestedScope = event.detail?.scope || 'live';
            if (requestedScope === 'demo') {
                void beginDemo();
                return;
            }
            if (isDemo) exitDemo();
            setError('');
            setPhase('welcome');
            setIsOpen(true);
        };
        window.addEventListener('promptly:open-tutorial', onTutorialRequest);
        return () => window.removeEventListener('promptly:open-tutorial', onTutorialRequest);
    }, [isDemo, startDemo, exitDemo]);

    useLayoutEffect(() => {
        if (!isOpen || phase !== 'tour') return undefined;
        let observedTarget = null;
        const measure = () => {
            const target = [...document.querySelectorAll(`[data-tour="${step.target}"]`)].find(candidate => {
                const candidateRect = candidate.getBoundingClientRect();
                return candidateRect.width > 0 && candidateRect.height > 0;
            });
            if (!target) {
                setRect(null);
                if (window.matchMedia?.('(max-width: 767px)').matches && mobileNavigationTargets.has(step.target)) {
                    window.dispatchEvent(new Event('promptly:open-mobile-nav'));
                }
                return;
            }
            if (target !== observedTarget) {
                resizeObserver?.disconnect();
                resizeObserver?.observe(target);
                observedTarget = target;
                target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
            }
            const next = target.getBoundingClientRect();
            setRect({ top: next.top, left: next.left, width: next.width, height: next.height });
        };
        const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
        const frame = window.requestAnimationFrame(measure);
        const mutationObserver = new MutationObserver(measure);
        mutationObserver.observe(document.body, { childList: true, subtree: true });
        window.addEventListener('resize', measure);
        window.addEventListener('scroll', measure, true);
        return () => {
            window.cancelAnimationFrame(frame);
            resizeObserver?.disconnect();
            mutationObserver.disconnect();
            window.removeEventListener('resize', measure);
            window.removeEventListener('scroll', measure, true);
        };
    }, [isOpen, phase, step.target]);

    useEffect(() => {
        if (!isOpen || phase !== 'tour') return;
        navigateTo(step.route);
    }, [isOpen, phase, step.route]);

    useEffect(() => {
        if (!isOpen) return undefined;
        try {
            window.sessionStorage.setItem(tourStorageKey(user?.id, scope), String(stepIndex));
        } catch { /* Session storage is best effort. */ }
        const frame = window.requestAnimationFrame(() => dialogRef.current?.querySelector('button:not([disabled])')?.focus());
        return () => window.cancelAnimationFrame(frame);
    }, [isOpen, scope, stepIndex, user?.id]);

    useEffect(() => {
        if (!isOpen) return undefined;
        const onKeyDown = event => {
            if (event.key === 'Escape') {
                event.preventDefault();
                closeWithoutCompletion();
                return;
            }
            if (phase !== 'tour') return;
            if (event.key === 'ArrowRight' && stepIndex < steps.length - 1) {
                event.preventDefault();
                setStepIndex(index => index + 1);
                return;
            }
            if (event.key === 'ArrowLeft' && stepIndex > 0) {
                event.preventDefault();
                setStepIndex(index => index - 1);
                return;
            }
            if (event.key !== 'Tab' || !dialogRef.current) return;
            const focusable = [...dialogRef.current.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')];
            if (!focusable.length) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [isOpen, phase, stepIndex]);

    const next = () => {
        if (stepIndex === steps.length - 1) return finish();
        setError('');
        setStepIndex(index => index + 1);
    };

    const previous = () => {
        setError('');
        setStepIndex(index => Math.max(0, index - 1));
    };

    if (!isOpen) return null;

    if (phase === 'welcome') {
        return (
            <div className="workspace-tour is-welcome" aria-live="polite">
                <section ref={dialogRef} className="workspace-tour-dialog workspace-tour-welcome" role="dialog" aria-modal="true" aria-labelledby="workspace-tour-welcome-title">
                    <div className="workspace-tour-welcome-mark" aria-hidden="true"><span>01</span><i /><span>02</span><i /><span>03</span></div>
                    <div className="workspace-tour-content">
                        <p className="workspace-tour-eyebrow">{isFirstRun ? 'Set up your workspace' : 'Workspace guide'}</p>
                        <h1 id="workspace-tour-welcome-title">A quick look around.</h1>
                        <p className="workspace-tour-body">See where to build, collect input, and review runs. Try a sample workspace if you want a safe place to click around.</p>
                        <div className="workspace-tour-concepts" aria-label="Tutorial overview">
                            <div><span>01</span><strong>Build</strong><small>Create an automation.</small></div>
                            <div><span>02</span><strong>Collect</strong><small>Start with clear input.</small></div>
                            <div><span>03</span><strong>Review</strong><small>See what happened.</small></div>
                        </div>
                        {onboardingContext?.hasRealData && <p className="workspace-tour-meta">The sample workspace is separate and read-only. Your automations, forms, and runs stay untouched.</p>}
                        {error && <p className="workspace-tour-error" role="alert">{error}</p>}
                        <div className="workspace-tour-welcome-actions">
                            <button type="button" className="workspace-tour-next workspace-tour-demo-button" onClick={beginDemo} disabled={isStartingDemo}>{isStartingDemo ? 'Preparing sample…' : 'Show me the sample'}</button>
                            <button type="button" className="workspace-tour-live-button" onClick={beginLive}>Use my workspace</button>
                            <button type="button" className="workspace-tour-skip" onClick={finish} disabled={completeOnboarding.isPending}>Skip for now</button>
                        </div>
                    </div>
                </section>
            </div>
        );
    }

    const spotlightStyle = rect ? {
        top: `${Math.max(8, rect.top - 6)}px`,
        left: `${Math.max(8, rect.left - 6)}px`,
        width: `${rect.width + 12}px`,
        height: `${rect.height + 12}px`
    } : undefined;
    const dialogStyle = rect ? {
        top: `${Math.min(Math.max(24, rect.top - 12), window.innerHeight - 332)}px`,
        left: `${Math.min(rect.left + rect.width + 28, window.innerWidth - 392)}px`
    } : undefined;

    return (
        <div className="workspace-tour" aria-live="polite">
            {rect && <div className="workspace-tour-spotlight" style={spotlightStyle} aria-hidden="true" />}
            <section ref={dialogRef} className="workspace-tour-dialog" style={dialogStyle} role="dialog" aria-modal="true" aria-labelledby="workspace-tour-title">
                <div className="workspace-tour-route" aria-hidden="true"><span>{String(stepIndex + 1).padStart(2, '0')}</span><i /><i /><i /><i /><i /></div>
                <div className="workspace-tour-content">
                    <div className="workspace-tour-heading-row"><p className="workspace-tour-eyebrow">{step.eyebrow}</p>{isDemo && <span className="workspace-tour-badge">Sample · read-only</span>}</div>
                    <h1 id="workspace-tour-title">{step.title}</h1>
                    <p className="workspace-tour-body">{step.body}</p>
                    {!rect && <p className="workspace-tour-fallback">This part of the workspace is not visible at this size. Use the navigation to follow along, then continue when you are ready.</p>}
                    <p className="workspace-tour-count">{String(stepIndex + 1).padStart(2, '0')} / {String(steps.length).padStart(2, '0')}</p>
                    {error && <p className="workspace-tour-error" role="alert">{error}</p>}
                    <div className="workspace-tour-actions">
                        <button type="button" className="workspace-tour-skip" onClick={finish} disabled={completeOnboarding.isPending}>Exit tutorial</button>
                        <div className="workspace-tour-pagination">
                            <button type="button" className="workspace-tour-back" onClick={previous} disabled={stepIndex === 0 || completeOnboarding.isPending}>Back</button>
                            <button type="button" className="workspace-tour-next" onClick={next} disabled={completeOnboarding.isPending}>{completeOnboarding.isPending ? 'Saving…' : stepIndex === steps.length - 1 ? 'Finish tutorial' : 'Next'}</button>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}
