import { apiBase } from './client.js';
import { getAuthToken } from '../utils/storage.js';

const STREAM_INACTIVITY_TIMEOUT_MS = 45000;

const createStreamError = (message, code) => {
    const error = new Error(message);
    error.code = code;
    return error;
};

export const generateFormFromPromptStream = async (prompt, currentSchema, formId, onProgress, options = {}) => {
    const headers = {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream'
    };
    const token = getAuthToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    const controller = new AbortController();
    let timeoutId;
    let completed = false;

    const armInactivityTimeout = () => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => controller.abort(), STREAM_INACTIVITY_TIMEOUT_MS);
    };

    try {
        armInactivityTimeout();
        const response = await fetch(`${apiBase}/api/forms/generate`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ prompt, currentSchema, formId, clarificationMode: options.clarificationMode }),
            signal: controller.signal
        });

        if (!response.ok) {
            throw createStreamError('Failed to start form generation.', 'FORM_AI_STREAM_START_FAILED');
        }

        if (!response.body) {
            throw createStreamError('Form generation returned an empty stream.', 'FORM_AI_STREAM_INCOMPLETE');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';

        while (!completed) {
            const { done, value } = await reader.read();
            if (done) break;

            armInactivityTimeout();
            buffer += decoder.decode(value, { stream: true });
            const events = buffer.split('\n\n');
            buffer = events.pop() || '';

            for (const event of events) {
                if (!event.startsWith('data: ')) continue;

                const dataStr = event.substring(6);
                let data;
                try {
                    data = JSON.parse(dataStr);
                } catch (error) {
                    console.error('Failed to parse SSE data:', error, dataStr);
                    continue;
                }

                if (data.type === 'progress') {
                    onProgress?.(data);
                } else if (data.type === 'complete') {
                    completed = true;
                    return data.result;
                } else if (data.type === 'error') {
                    const error = createStreamError(data.message, data.code);
                    error.issues = data.issues;
                    throw error;
                }
            }
        }

        if (!completed) {
            throw createStreamError(
                'Form generation ended before a result was received.',
                'FORM_AI_STREAM_INCOMPLETE'
            );
        }
    } catch (error) {
        if (error.name === 'AbortError') {
            throw createStreamError(
                'Form generation timed out. Please try again.',
                'FORM_AI_STREAM_TIMEOUT'
            );
        }
        throw error;
    } finally {
        clearTimeout(timeoutId);
    }
};

export const submitFormAITurnStream = async (formId, command, clarificationMode, onProgress, options = {}) => {
    const headers = {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream'
    };
    const token = getAuthToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    const controller = new AbortController();
    let timeoutId;
    let completed = false;
    const armInactivityTimeout = () => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => controller.abort(), options.timeoutMs || STREAM_INACTIVITY_TIMEOUT_MS);
    };

    try {
        armInactivityTimeout();
        const response = await fetch(`${apiBase}/api/forms/${formId}/ai-turns`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                command,
                clarificationMode,
                ...(Number.isInteger(options.expectedStateVersion) ? { expectedStateVersion: options.expectedStateVersion } : {}),
                requestId: options.requestId || (globalThis.crypto?.randomUUID?.() || `request_${Date.now()}`)
            }),
            signal: controller.signal
        });
        if (!response.ok || !response.body) {
            throw createStreamError('Failed to start form AI turn.', 'FORM_AI_STREAM_START_FAILED');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        while (!completed) {
            const { done, value } = await reader.read();
            if (done) break;
            armInactivityTimeout();
            buffer += decoder.decode(value, { stream: true });
            const events = buffer.split('\n\n');
            buffer = events.pop() || '';
            for (const event of events) {
                if (!event.startsWith('data: ')) continue;
                let data;
                try {
                    data = JSON.parse(event.substring(6));
                } catch (error) {
                    console.error('Failed to parse form AI turn event:', error);
                    continue;
                }
                if (data.type === 'progress') onProgress?.(data);
                if (data.type === 'complete') {
                    completed = true;
                    return data.result;
                }
                if (data.type === 'error') {
                    const error = createStreamError(data.message, data.code);
                    error.issues = data.issues;
                    throw error;
                }
            }
        }
        throw createStreamError('Form AI turn ended before a result was received.', 'FORM_AI_STREAM_INCOMPLETE');
    } catch (error) {
        if (error.name === 'AbortError') {
            throw createStreamError('Form AI turn timed out. Please try again.', 'FORM_AI_STREAM_TIMEOUT');
        }
        throw error;
    } finally {
        clearTimeout(timeoutId);
    }
};
