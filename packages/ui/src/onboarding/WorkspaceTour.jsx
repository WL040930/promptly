import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useCompleteOnboarding } from '../api/hooks/useAuth.js';
import { navigateTo } from '../utils/router.js';

const steps = [
    {
        target: 'create-automation',
        route: { page: 'home' },
        eyebrow: 'Welcome to Promptly',
        title: 'Start with an outcome',
        body: 'Create an automation from a sentence, or open a visual canvas when you already know the steps.'
    },
    {
        target: 'automations',
        route: { page: 'automations' },
        eyebrow: 'Your working library',
        title: 'Build and publish automations',
        body: 'Keep every workflow in one place. Open one to refine its logic, publish it, or check its latest activity.'
    },
    {
        target: 'forms',
        route: { page: 'forms' },
        eyebrow: 'Where work begins',
        title: 'Collect the right input',
        body: 'Forms turn requests into structured information and can trigger an automation as soon as someone submits one.'
    },
    {
        target: 'monitoring',
        route: { page: 'runs' },
        eyebrow: 'Stay in control',
        title: 'Watch work and make decisions',
        body: 'Runs show what happened. Approvals pause a workflow whenever a person should choose the next path.'
    },
    {
        target: 'assistant',
        route: { page: 'assistant' },
        eyebrow: 'Your workspace guide',
        title: 'Ask Promptly',
        body: 'Use the assistant to understand the workspace, shape a request, and review proposed changes before you apply them.'
    },
    {
        target: 'settings-connections',
        route: { page: 'settings', section: 'connections' },
        eyebrow: 'Make automations useful',
        title: 'Connect the services you use',
        body: 'Settings → Connections is where you authorize services such as Google. Once connected, automations can use those accounts without asking every time.'
    }
];

const tourStorageKey = userId => `promptly.workspace-tour.${userId || 'guest'}`;

function getSavedStep(userId) {
    const value = Number(window.sessionStorage.getItem(tourStorageKey(userId)));
    return Number.isInteger(value) && value >= 0 && value < steps.length ? value : 0;
}

export default function WorkspaceTour({ user, onOnboardingComplete }) {
    const [stepIndex, setStepIndex] = useState(() => getSavedStep(user?.id));
    const [rect, setRect] = useState(null);
    const [error, setError] = useState('');
    const dialogRef = useRef(null);
    const completeOnboarding = useCompleteOnboarding();
    const step = steps[stepIndex];

    useLayoutEffect(() => {
        let observedTarget = null;
        const resizeObserver = new ResizeObserver(() => measure());
        const measure = () => {
            const target = document.querySelector(`[data-tour="${step.target}"]`);
            if (!target) {
                setRect(null);
                return;
            }
            if (target !== observedTarget) {
                resizeObserver.disconnect();
                resizeObserver.observe(target);
                observedTarget = target;
                target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
            }
            const next = target.getBoundingClientRect();
            setRect({ top: next.top, left: next.left, width: next.width, height: next.height });
        };
        const frame = window.requestAnimationFrame(measure);
        const mutationObserver = new MutationObserver(measure);
        mutationObserver.observe(document.body, { childList: true, subtree: true });
        window.addEventListener('resize', measure);
        window.addEventListener('scroll', measure, true);
        return () => {
            window.cancelAnimationFrame(frame);
            resizeObserver.disconnect();
            mutationObserver.disconnect();
            window.removeEventListener('resize', measure);
            window.removeEventListener('scroll', measure, true);
        };
    }, [step.target]);

    useEffect(() => {
        navigateTo(step.route);
    }, [step.route]);

    useEffect(() => {
        window.sessionStorage.setItem(tourStorageKey(user?.id), String(stepIndex));
        const frame = window.requestAnimationFrame(() => dialogRef.current?.querySelector('button:not([disabled])')?.focus());
        return () => window.cancelAnimationFrame(frame);
    }, [stepIndex, user?.id]);

    useEffect(() => {
        const onKeyDown = event => {
            if (event.key === 'Escape') {
                event.preventDefault();
                finish();
                return;
            }
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
    // finish is intentionally stable enough for the tour lifetime; subscriptions refresh on step changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stepIndex]);

    const finish = async () => {
        if (completeOnboarding.isPending) return;
        setError('');
        try {
            const response = await completeOnboarding.mutateAsync();
            window.sessionStorage.removeItem(tourStorageKey(user?.id));
            onOnboardingComplete(response.user);
            navigateTo({ page: 'home' });
        } catch (completionError) {
            setError(completionError.message || 'We could not save your onboarding progress. Please try again.');
        }
    };

    const next = () => {
        if (stepIndex === steps.length - 1) return finish();
        setError('');
        setStepIndex(index => index + 1);
    };

    const previous = () => {
        setError('');
        setStepIndex(index => Math.max(0, index - 1));
    };

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
                    <p className="workspace-tour-eyebrow">{step.eyebrow}</p>
                    <h1 id="workspace-tour-title">{step.title}</h1>
                    <p className="workspace-tour-body">{step.body}</p>
                    <p className="workspace-tour-count">{String(stepIndex + 1).padStart(2, '0')} / {String(steps.length).padStart(2, '0')}</p>
                    {error && <p className="workspace-tour-error" role="alert">{error}</p>}
                    <div className="workspace-tour-actions">
                        <button type="button" className="workspace-tour-skip" onClick={finish} disabled={completeOnboarding.isPending}>Skip tour</button>
                        <div className="workspace-tour-pagination">
                            <button type="button" className="workspace-tour-back" onClick={previous} disabled={stepIndex === 0 || completeOnboarding.isPending}>Back</button>
                            <button type="button" className="workspace-tour-next" onClick={next} disabled={completeOnboarding.isPending}>{completeOnboarding.isPending ? 'Saving…' : stepIndex === steps.length - 1 ? 'Finish tour' : 'Next'}</button>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}
