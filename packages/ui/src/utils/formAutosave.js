export function createDebouncedSaveQueue({ save, delay = 600, onError = null }) {
    let pending = null;
    let timer = null;
    let inFlight = Promise.resolve();
    let isSaving = false;

    const reportBackgroundError = error => {
        try {
            onError?.(error);
        } catch {
            // Error reporting must not create a second unhandled rejection.
        }
    };

    const run = () => {
        if (isSaving || !pending) return inFlight;
        const update = pending;
        pending = null;
        isSaving = true;
        inFlight = Promise.resolve(save(update))
            .finally(() => {
                isSaving = false;
                // Keep at most one newest update behind the active request.
                // This prevents a slow connection from reordering writes.
                if (pending && !timer) void run().catch(reportBackgroundError);
            });
        return inFlight;
    };

    const schedule = update => {
        pending = { ...(pending || {}), ...update };
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
            timer = null;
            void run().catch(reportBackgroundError);
        }, delay);
    };

    const flush = async () => {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
        // A save can schedule another latest update while the previous request
        // is in flight. Drain both before callers cross a save boundary.
        while (pending || isSaving) {
            await run();
        }
        return inFlight;
    };

    return { schedule, flush };
}
