import { requestAgentJson } from './agentAi.js';
import { makeIntent } from './agentContracts.js';

export const MIN_INTENT_CONFIDENCE = 0.70;

const ACTION_GOALS = new Set(['create', 'modify', 'connect']);
const SOLUTION_DOMAINS = new Set(['form', 'workflow']);
const isPlainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

const contextForPrompt = context => ({
    formId: context?.formId || null,
    workflowId: context?.workflowId || null,
    executionId: context?.executionId || null,
    activeResource: context?.activeResource || null,
    clarificationAnswers: Array.isArray(context?.clarificationAnswers) ? context.clarificationAnswers.slice(-8) : []
});

const promptFor = ({ message, context }) => [
    'User request:', String(message || ''),
    '',
    'Selected UI context:', JSON.stringify(contextForPrompt(context)),
    '',
    'Decide whether this is ordinary conversation, an actionable Promptly task, or a request that needs one clarification question.',
    'For actionable tasks, decide independently whether the user needs a form, a workflow, or both.',
    'A resource mentioned as a workflow input is not automatically a request to create or modify that resource.',
    'Use safe defaults when a detail is not essential, such as an unnamed spreadsheet destination or email copy.',
    'Return the typed decision JSON only.'
].join('\n');

const explicitDestructiveRisk = message => {
    const text = String(message || '');
    return /\b(delete|remove|clear|disconnect|erase)\b/i.test(text)
        ? { risk: 'high', destructiveActions: [text.slice(0, 500)] }
        : {};
};

const intentValueFrom = value => isPlainObject(value?.intent) ? value.intent : value;

const questionFor = (value, intent) => {
    const question = String(value?.clarification?.question || value?.question || '').trim();
    if (question) return question.slice(0, 1000);
    if (intent.goal === 'create' || intent.goal === 'modify' || intent.goal === 'connect') {
        return 'Should I prepare a form, a workflow, or both for this request?';
    }
    return 'Could you clarify what you would like Promptly to prepare?';
};

const normalizeDecision = (value, message) => {
    const rawIntent = intentValueFrom(value);
    const rawConfidence = value?.confidence ?? rawIntent?.confidence;
    const confidence = Number.isFinite(Number(rawConfidence))
        ? Math.max(0, Math.min(1, Number(rawConfidence)))
        : 0;
    const intent = makeIntent({ ...rawIntent, confidence, ...explicitDestructiveRisk(message) });
    const requestedDomains = new Set([
        ...intent.domains,
        ...intent.requestedOperations.map(operation => operation.domain)
    ]);
    const hasSolutionDomain = [...requestedDomains].some(domain => SOLUTION_DOMAINS.has(domain));
    const requestedAction = ACTION_GOALS.has(intent.goal)
        || intent.requestedOperations.some(operation => ACTION_GOALS.has(operation.action));
    const modelRoute = String(value?.route || value?.disposition || '').trim().toLowerCase();

    let route;
    if (modelRoute === 'conversation' || modelRoute === 'chat') {
        route = 'conversation';
    } else if (modelRoute === 'clarification' || modelRoute === 'clarify' || confidence < MIN_INTENT_CONFIDENCE) {
        route = 'clarification';
    } else if ((modelRoute === 'agent' || modelRoute === 'action' || modelRoute === '') && requestedAction && hasSolutionDomain) {
        route = 'agent';
    } else {
        route = 'conversation';
    }

    return {
        route,
        intent,
        confidence,
        ...(route === 'clarification'
            ? {
                clarification: {
                    question: questionFor(value, intent),
                    options: isPlainObject(value?.clarification) && Array.isArray(value.clarification.options)
                        ? value.clarification.options.slice(0, 6)
                        : []
                }
            }
            : {})
    };
};

export const decideAgentIntent = async ({ message, context = {}, onActivity = null, requestJson = requestAgentJson } = {}) => {
    try {
        const result = await requestJson({
            label: 'intent',
            prompt: promptFor({ message, context }),
            onActivity
        });
        if (!isPlainObject(result?.value)) {
            return {
                route: 'unavailable',
                error: { code: 'AGENT_INTENT_INVALID', message: 'The AI returned no usable intent decision.' },
                tokenUsage: result?.tokenUsage || {}
            };
        }
        return {
            ...normalizeDecision(result.value, message),
            tokenUsage: result.tokenUsage || {}
        };
    } catch (error) {
        return {
            route: 'unavailable',
            error: {
                code: error?.code || 'AGENT_INTENT_UNAVAILABLE',
                message: 'Promptly could not understand the request right now. Please try again.'
            },
            tokenUsage: error?.tokenUsage || {}
        };
    }
};
