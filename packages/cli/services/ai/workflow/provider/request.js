import { ai } from '../../index.js';
import { AI_TASKS } from '../../core/aiTasks.js';
import { AIError } from '../../core/aiErrors.js';
import { recordAiDiagnostic } from '../../core/diagnosticsLogger.js';

const TASKS = Object.freeze({
    planner: AI_TASKS.WORKFLOW_PLAN,
    'planner repair': AI_TASKS.WORKFLOW_PLAN_REPAIR,
    worker: AI_TASKS.WORKFLOW_BUILD,
    'worker repair': AI_TASKS.WORKFLOW_BUILD_REPAIR,
    verifier: AI_TASKS.WORKFLOW_VERIFY,
    'verifier repair': AI_TASKS.WORKFLOW_VERIFY_REPAIR
});

const outputError = (message, code, issues = []) => {
    const error = new Error(message);
    error.code = code;
    error.issues = issues;
    return error;
};

const normalizeProviderError = (label, error) => {
    if (error?.code === 'AI_BUDGET_EXCEEDED') {
        return outputError('Workflow AI could not finish safely within its request budget. No changes were applied.', 'WORKFLOW_AI_BUDGET_EXCEEDED', [{
            code: 'CALL_BUDGET_EXCEEDED', path: label, message: `Maximum ${error.maxCalls} AI calls reached.`
        }]);
    }
    if (error?.category === 'rate_limited') return outputError('Workflow AI is temporarily rate limited. Please try again shortly.', 'WORKFLOW_AI_RATE_LIMITED');
    if (error?.category === 'timeout') return outputError('Workflow AI timed out. Please try again.', 'WORKFLOW_AI_PROVIDER_TIMEOUT');
    if (['unavailable', 'network'].includes(error?.category) || error?.code === 'AI_ROUTE_UNAVAILABLE') {
        return outputError('Workflow AI is temporarily unavailable. Please try again shortly.', 'WORKFLOW_AI_PROVIDER_UNAVAILABLE');
    }
    return error;
};

export const requestWorkflowJson = async ({ label, prompt, systemInstruction, provider = null, budget, signal = null }) => {
    try {
        const response = await ai.run({
            task: TASKS[label],
            messages: [{ role: 'user', parts: [{ text: prompt }] }],
            systemInstruction,
            operation: `workflow:${label}`,
            providerOverride: provider,
            budget,
            signal
        });
        return { value: response.json, rawText: response.text, response };
    } catch (error) {
        const normalized = normalizeProviderError(label, error);
        if (normalized instanceof AIError && normalized.code === 'AI_INVALID_OUTPUT') {
            const finishReason = normalized.response?.finishReason || null;
            const truncated = ['LENGTH', 'MAX_TOKENS', 'MAX_OUTPUT_TOKENS'].includes(String(finishReason || '').toUpperCase());
            const issues = [{
                code: truncated ? 'OUTPUT_TRUNCATED' : 'INVALID_JSON',
                path: '',
                message: truncated
                    ? 'The AI response reached its output limit before completing JSON.'
                    : normalized.parserError || normalized.message
            }];
            await recordAiDiagnostic({
                event: 'workflow_output_invalid_json',
                stage: label,
                finishReason,
                rawTextLength: normalized.rawText?.length || 0,
                issues
            });
            return { value: null, rawText: normalized.rawText || '', response: normalized.response || null, parseIssues: issues };
        }
        throw normalized;
    }
};

export const workflowOutputIssues = ({ call, validate }) => call.parseIssues || validate(call.value);
