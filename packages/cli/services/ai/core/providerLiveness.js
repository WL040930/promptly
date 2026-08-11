export const PROVIDER_LIVENESS_INTERVAL_MS = 10_000;

const defaultNow = () => Date.now();

/**
 * Emits a durable activity signal only while a provider attempt is actually
 * in flight. This is deliberately separate from transport heartbeats: a
 * client can use it to tell a slow, healthy model call from a stalled turn.
 */
export const runWithProviderLiveness = async ({
    execute,
    onActivity = null,
    operation,
    attempt,
    maxAttempts,
    provider,
    model,
    intervalMs = PROVIDER_LIVENESS_INTERVAL_MS,
    now = defaultNow,
    setIntervalFn = setInterval,
    clearIntervalFn = clearInterval
} = {}) => {
    if (typeof execute !== 'function') throw new TypeError('execute is required.');

    const startedAt = now();
    const emit = () => onActivity?.({
        type: 'provider_waiting',
        operation,
        attempt,
        maxAttempts,
        provider,
        model,
        elapsedMs: Math.max(0, now() - startedAt)
    });
    const timer = typeof onActivity === 'function' && intervalMs > 0
        ? setIntervalFn(emit, intervalMs)
        : null;

    try {
        return await execute();
    } finally {
        if (timer !== null && timer !== undefined) clearIntervalFn(timer);
    }
};
