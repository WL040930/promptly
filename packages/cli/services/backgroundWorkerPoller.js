const DEFAULT_MAX_BACKOFF_MS = 30_000;

export const createBackgroundWorkerPoller = ({
    task,
    intervalMs = 1_000,
    maxBackoffMs = DEFAULT_MAX_BACKOFF_MS,
    schedule = setTimeout,
    cancel = clearTimeout,
    onError = () => {}
} = {}) => {
    if (typeof task !== 'function') throw new TypeError('A background worker task is required.');
    if (!Number.isFinite(intervalMs) || intervalMs <= 0) throw new TypeError('intervalMs must be positive.');
    if (!Number.isFinite(maxBackoffMs) || maxBackoffMs < intervalMs) throw new TypeError('maxBackoffMs must be at least intervalMs.');

    let stopped = true;
    let timer = null;
    let inFlight = null;
    let retryDelayMs = intervalMs;

    const scheduleNext = delayMs => {
        if (stopped || timer !== null) return;
        timer = schedule(() => {
            timer = null;
            return runOnce();
        }, delayMs);
    };

    const runOnce = () => {
        if (stopped) return Promise.resolve();
        if (inFlight) return inFlight;

        inFlight = (async () => {
            let failed = false;
            try {
                await task();
                retryDelayMs = intervalMs;
            } catch (error) {
                failed = true;
                try {
                    await onError(error);
                } catch {
                    // Error reporting must not disable the worker retry loop.
                }
                retryDelayMs = Math.min(retryDelayMs * 2, maxBackoffMs);
            } finally {
                inFlight = null;
                scheduleNext(failed ? retryDelayMs : intervalMs);
            }
        })();

        return inFlight;
    };

    const start = ({ immediate = false } = {}) => {
        if (!stopped) return inFlight || Promise.resolve();
        stopped = false;
        retryDelayMs = intervalMs;
        if (immediate) return runOnce();
        scheduleNext(intervalMs);
        return Promise.resolve();
    };

    const stop = async () => {
        stopped = true;
        if (timer !== null) {
            cancel(timer);
            timer = null;
        }
        await inFlight;
    };

    return { start, stop, runOnce };
};
