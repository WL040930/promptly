const RETRYABLE_CATEGORIES = new Set(['timeout', 'rate_limited', 'unavailable', 'network']);

export class AIError extends Error {
    constructor(message, details = {}) {
        super(message);
        this.name = 'AIError';
        Object.assign(this, details);
    }
}

const getRetryAfterSeconds = error => {
    const value = error?.retryAfterSeconds
        ?? error?.headers?.['retry-after']
        ?? error?.headers?.get?.('retry-after');
    const seconds = Number(value);
    return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : null;
};

const getStatus = error => Number(error?.status ?? error?.statusCode);

const isProviderJsonGenerationFailure = ({ code, message }) => (
    code.includes('JSON_VALIDATE_FAILED')
    || /json_validate_failed|failed to generate json/i.test(message)
);

const getCategory = error => {
    const status = getStatus(error);
    const code = String(error?.code || '').toUpperCase();
    const message = String(error?.message || '');

    if (error?.name === 'AbortError' || code.includes('CANCEL')) return 'cancelled';
    if (code.includes('TIMEOUT') || code === 'DEADLINE_EXCEEDED' || [408, 504].includes(status) || /timed out|timeout|deadline expired/i.test(message)) return 'timeout';
    if (status === 402 || /payment required/i.test(message)) return 'payment_required';
    if (status === 429 || code.includes('RATE') || code.includes('QUOTA') || /rate limit|too many requests|quota exceeded/i.test(message)) return 'rate_limited';
    if ([500, 502, 503].includes(status) || code === 'UNAVAILABLE' || /temporarily unavailable|high demand|service unavailable/i.test(message)) return 'unavailable';
    if (isProviderJsonGenerationFailure({ code, message })) return 'invalid_output';
    if (code.includes('AUTH') || [401, 403].includes(status)) return 'auth';
    if ([400, 404, 409, 413, 422].includes(status)) return 'bad_request';
    if (/network|fetch failed|connection reset|socket/i.test(message)) return 'network';
    return 'unknown';
};

export const normalizeAIError = (error, context = {}) => {
    if (error instanceof AIError) {
        return new AIError(error.message, {
            ...error,
            ...context,
            code: error.category === 'invalid_output' ? 'AI_INVALID_OUTPUT' : error.code,
            retryable: error.retryable ?? RETRYABLE_CATEGORIES.has(error.category)
        });
    }

    const category = getCategory(error);
    const retryAfterSeconds = getRetryAfterSeconds(error);
    return new AIError(error?.message || 'AI provider request failed.', {
        ...context,
        category,
        code: category === 'invalid_output' ? 'AI_INVALID_OUTPUT' : error?.code,
        retryable: RETRYABLE_CATEGORIES.has(category),
        status: getStatus(error) || undefined,
        retryAfterSeconds,
        cause: error
    });
};

export const isRetryableAIError = error => Boolean(error?.retryable);

export const createBudgetError = ({ task, label, calls, maxCalls }) => new AIError(
    'The AI request budget was exceeded.',
    {
        code: 'AI_BUDGET_EXCEEDED',
        category: 'budget',
        retryable: false,
        task,
        label,
        calls,
        maxCalls
    }
);
