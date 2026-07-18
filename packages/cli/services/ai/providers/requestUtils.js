export const fetchWithTimeout = async (url, options = {}, timeoutMs) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const externalSignal = options.signal;
    const abortFromCaller = () => controller.abort(externalSignal.reason);
    if (externalSignal) {
        if (externalSignal.aborted) abortFromCaller();
        else externalSignal.addEventListener('abort', abortFromCaller, { once: true });
    }

    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } catch (error) {
        if (error.name === 'AbortError') {
            const timeoutError = new Error('AI provider request timed out.');
            timeoutError.code = externalSignal?.aborted ? 'AI_CANCELLED' : 'AI_TIMEOUT';
            throw timeoutError;
        }
        throw error;
    } finally {
        clearTimeout(timer);
        if (externalSignal) externalSignal.removeEventListener('abort', abortFromCaller);
    }
};
