export const fetchWithTimeout = async (url, options = {}, timeoutMs) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } catch (error) {
        if (error.name === 'AbortError') {
            const timeoutError = new Error('AI provider request timed out.');
            timeoutError.code = 'FORM_AI_PROVIDER_TIMEOUT';
            throw timeoutError;
        }
        throw error;
    } finally {
        clearTimeout(timer);
    }
};
