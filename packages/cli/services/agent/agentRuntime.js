const DEFAULT_LIMITS = Object.freeze({
    maxActions: 8,
    maxReplans: 2
});

const isPlainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));

const normalizeLimits = limits => ({
    maxActions: Number.isInteger(limits?.maxActions) && limits.maxActions > 0
        ? limits.maxActions
        : DEFAULT_LIMITS.maxActions,
    maxReplans: Number.isInteger(limits?.maxReplans) && limits.maxReplans >= 0
        ? limits.maxReplans
        : DEFAULT_LIMITS.maxReplans
});

const normalizeStep = (step, index) => ({
    id: String(step?.id || `step_${index + 1}`).trim(),
    type: String(step?.type || '').trim(),
    title: String(step?.title || step?.type || `Step ${index + 1}`).trim(),
    description: String(step?.description || '').trim(),
    args: isPlainObject(step?.args) ? clone(step.args) : {},
    dependsOn: Array.isArray(step?.dependsOn) ? step.dependsOn.map(String) : [],
    status: ['pending', 'running', 'completed', 'failed', 'blocked', 'awaiting_clarification', 'awaiting_approval'].includes(step?.status)
        ? step.status
        : 'pending'
});

const normalizePlan = plan => {
    if (!isPlainObject(plan) || !Array.isArray(plan.steps) || plan.steps.length === 0) {
        const error = new Error('Agent plan must contain at least one step.');
        error.code = 'AGENT_PLAN_INVALID';
        throw error;
    }

    const steps = plan.steps.map(normalizeStep);
    const ids = new Set();
    for (const step of steps) {
        if (!step.id || !step.type || ids.has(step.id)) {
            const error = new Error('Agent plan step IDs must be unique and have a type.');
            error.code = 'AGENT_PLAN_INVALID';
            throw error;
        }
        ids.add(step.id);
    }
    for (const step of steps) {
        if (step.dependsOn.some(dependency => !ids.has(dependency))) {
            const error = new Error(`Agent plan step '${step.id}' depends on an unknown step.`);
            error.code = 'AGENT_PLAN_INVALID';
            throw error;
        }
    }

    return {
        ...clone(plan),
        steps,
        approvalRequired: plan.approvalRequired !== false
    };
};

const mergeReplannedPlan = (previousPlan, nextPlan) => {
    const previousById = new Map(previousPlan.steps.map(step => [step.id, step]));
    return {
        ...nextPlan,
        steps: nextPlan.steps.map(step => {
            const previous = previousById.get(step.id);
            const sameWork = previous
                && previous.type === step.type
                && JSON.stringify(previous.args || {}) === JSON.stringify(step.args || {});
            return sameWork && previous.status === 'completed'
                ? { ...step, status: 'completed' }
                : { ...step, status: 'pending' };
        })
    };
};

const nextReadyStep = steps => steps.find(step => (
    step.status === 'pending'
    && step.dependsOn.every(dependency => steps.find(item => item.id === dependency)?.status === 'completed')
));

const hasPendingSteps = steps => steps.some(step => step.status === 'pending');

const allStepsCompleted = steps => steps.every(step => step.status === 'completed');

const normalizeObservation = observation => {
    if (!isPlainObject(observation)) return { status: 'completed', output: observation };
    return {
        status: ['completed', 'awaiting_clarification', 'awaiting_approval', 'blocked', 'replan'].includes(observation.status)
            ? observation.status
            : 'completed',
        output: observation.output,
        message: observation.message ? String(observation.message) : undefined,
        reason: observation.reason ? String(observation.reason) : undefined,
        issues: Array.isArray(observation.issues) ? observation.issues.slice(0, 20) : [],
        tokenUsage: observation.tokenUsage || null
    };
};

const mergeUsage = (total = {}, current = {}) => ({
    promptTokens: (total.promptTokens || 0) + (current?.promptTokens || 0),
    completionTokens: (total.completionTokens || 0) + (current?.completionTokens || 0),
    totalTokens: (total.totalTokens || 0) + (current?.totalTokens || 0)
});

export class AgentRuntimeError extends Error {
    constructor(message, code = 'AGENT_RUNTIME_FAILED', issues = []) {
        super(message);
        this.name = 'AgentRuntimeError';
        this.code = code;
        this.issues = issues;
    }
}

/**
 * Execute a typed plan through registered capabilities.
 *
 * The runtime is intentionally model-agnostic. A planner creates a plan and
 * capabilities produce observations; this module owns ordering, bounded
 * action/replan budgets, and terminal states. It never applies user data.
 */
export const createAgentRuntime = ({ registry, planner, limits = {}, onEvent = null } = {}) => {
    if (!registry || typeof registry.get !== 'function') throw new TypeError('An agent capability registry is required.');
    if (!planner || typeof planner.plan !== 'function') throw new TypeError('An agent planner is required.');
    const normalizedLimits = normalizeLimits(limits);

    const emit = event => {
        if (typeof onEvent === 'function') onEvent(event);
    };

    const run = async ({ input = {}, state = {}, plan: suppliedPlan = null, signal = null } = {}) => {
        let plan = suppliedPlan ? normalizePlan(suppliedPlan) : normalizePlan(await planner.plan({ input, state }));
        const runtimeState = {
            ...clone(state),
            outputs: { ...(clone(state.outputs) || {}) },
            observations: [...(state.observations || [])]
        };
        let actionCount = 0;
        let replanCount = 0;
        let tokenUsage = {};

        while (hasPendingSteps(plan.steps)) {
            if (signal?.aborted) throw new AgentRuntimeError('Agent execution was cancelled.', 'AGENT_CANCELLED');
            if (actionCount >= normalizedLimits.maxActions) {
                throw new AgentRuntimeError(
                    `Agent action budget exceeded (${normalizedLimits.maxActions}).`,
                    'AGENT_ACTION_BUDGET_EXCEEDED'
                );
            }

            const step = nextReadyStep(plan.steps);
            if (!step) {
                throw new AgentRuntimeError(
                    'Agent plan has no executable step; dependencies may be cyclic or blocked.',
                    'AGENT_PLAN_DEADLOCK'
                );
            }
            const capability = registry.get(step.type);
            if (!capability) {
                throw new AgentRuntimeError(
                    `No capability is registered for plan step '${step.type}'.`,
                    'AGENT_CAPABILITY_UNAVAILABLE',
                    [{ path: `plan.steps.${step.id}`, message: `Unknown capability '${step.type}'.` }]
                );
            }

            step.status = 'running';
            emit({ type: 'step.started', step: clone(step), actionCount: actionCount + 1 });
            let observation;
            try {
                observation = normalizeObservation(await capability.execute({
                    args: step.args || {},
                    context: { input, state: runtimeState, plan, step, signal },
                    capability
                }));
                const outputIssues = typeof registry.validateOutput === 'function'
                    ? registry.validateOutput(step.type, observation.output)
                    : [];
                if (outputIssues.length > 0) {
                    throw new AgentRuntimeError(
                        `Capability '${step.type}' returned an invalid output.`,
                        'AGENT_CAPABILITY_OUTPUT_INVALID',
                        outputIssues
                    );
                }
            } catch (error) {
                step.status = 'failed';
                throw error;
            }

            actionCount += 1;
            tokenUsage = mergeUsage(tokenUsage, observation.tokenUsage);
            runtimeState.observations.push({ stepId: step.id, type: step.type, ...clone(observation) });
            emit({ type: 'step.completed', step: clone(step), observation: clone(observation), actionCount });

            if (observation.status === 'replan') {
                if (replanCount >= normalizedLimits.maxReplans || typeof planner.replan !== 'function') {
                    throw new AgentRuntimeError(
                        observation.message || 'The agent could not recover its plan.',
                        'AGENT_REPLAN_LIMIT_EXCEEDED',
                        observation.issues
                    );
                }
                replanCount += 1;
                const replanned = await planner.replan({ input, state: runtimeState, plan, step, observation });
                const nextPlan = replanned?.plan || replanned;
                tokenUsage = mergeUsage(tokenUsage, replanned?.tokenUsage);
                plan = mergeReplannedPlan(plan, normalizePlan(nextPlan));
                emit({ type: 'plan.revised', plan: clone(plan), replanCount });
                continue;
            }

            step.status = observation.status === 'completed' ? 'completed' : observation.status;
            runtimeState.outputs[step.id] = clone(observation.output);

            if (observation.status !== 'completed') {
                return {
                    status: observation.status,
                    plan,
                    state: runtimeState,
                    observation,
                    actionCount,
                    replanCount,
                    tokenUsage
                };
            }
        }

        return {
            status: plan.approvalRequired ? 'awaiting_approval' : 'completed',
            plan,
            state: runtimeState,
            actionCount,
            replanCount,
            tokenUsage,
            completed: allStepsCompleted(plan.steps)
        };
    };

    return Object.freeze({ run });
};
