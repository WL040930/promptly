export function createDebouncedSaveQueue({ save, delay = 600 }) {
    let pending = null;
    let timer = null;
    let inFlight = Promise.resolve();

    const run = () => {
        if (!pending) return inFlight;
        const update = pending;
        pending = null;
        inFlight = Promise.resolve(save(update));
        return inFlight;
    };

    const schedule = update => {
        pending = { ...(pending || {}), ...update };
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
            timer = null;
            void run().catch(() => {});
        }, delay);
    };

    const flush = async () => {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
        await run();
        return inFlight;
    };

    return { schedule, flush };
}
