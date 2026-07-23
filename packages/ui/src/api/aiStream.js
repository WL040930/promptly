import { apiBase } from './client.js';
import { getAuthToken } from '../utils/storage.js';

const STREAM_INACTIVITY_TIMEOUT_MS = 45000;

const createStreamError = (message, code) => {
    const error = new Error(message);
    error.code = code;
    return error;
};

export const submitAssistantTurnStream = async ({ sessionId = null, message = '', context = {}, event = null, onEvent, signal: externalSignal } = {}) => {
    const headers = {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream'
    };
    const token = getAuthToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    const controller = new AbortController();
    let timeoutId;
    const armInactivityTimeout = () => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => controller.abort(), STREAM_INACTIVITY_TIMEOUT_MS);
    };
    const abortExternal = () => controller.abort();
    externalSignal?.addEventListener('abort', abortExternal, { once: true });
    try {
        armInactivityTimeout();
        const response = await fetch(`${apiBase}/api/assistant/turns`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ sessionId, message, context, ...(event ? { event } : {}) }),
            signal: controller.signal
        });
        if (!response.ok || !response.body) throw createStreamError('Failed to start assistant turn.', 'ASSISTANT_STREAM_START_FAILED');

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            armInactivityTimeout();
            buffer += decoder.decode(value, { stream: true });
            const events = buffer.split('\n\n');
            buffer = events.pop() || '';
            for (const rawEvent of events) {
                if (!rawEvent.startsWith('data: ')) continue;
                let data;
                try {
                    data = JSON.parse(rawEvent.substring(6));
                } catch {
                    continue;
                }
                onEvent?.(data);
                if (data.type === 'turn.completed') return data.result;
                if (data.type === 'turn.failed') {
                    const error = createStreamError(data.message || 'Assistant turn failed.', data.code || 'ASSISTANT_TURN_FAILED');
                    error.issues = data.issues;
                    throw error;
                }
            }
        }
        throw createStreamError('Assistant turn ended before a result was received.', 'ASSISTANT_STREAM_INCOMPLETE');
    } catch (error) {
        if (error.name === 'AbortError') throw createStreamError('Assistant turn timed out. Please try again.', 'ASSISTANT_STREAM_TIMEOUT');
        throw error;
    } finally {
        clearTimeout(timeoutId);
        externalSignal?.removeEventListener('abort', abortExternal);
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

export const submitWorkflowAITurnStream = async (workflowId, text, clarificationMode, onProgress, options = {}) => {
    const headers = {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream'
    };
    const token = getAuthToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    const controller = new AbortController();
    let timeoutId;
    const armInactivityTimeout = () => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => controller.abort(), options.timeoutMs || STREAM_INACTIVITY_TIMEOUT_MS);
    };

    try {
        armInactivityTimeout();
        const response = await fetch(`${apiBase}/api/automations/${workflowId}/ai-turns`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                text,
                clarificationMode,
                ...(Number.isInteger(options.expectedStateVersion) ? { expectedStateVersion: options.expectedStateVersion } : {}),
                requestId: options.requestId || (globalThis.crypto?.randomUUID?.() || `workflow_turn_${Date.now()}`)
            }),
            signal: controller.signal
        });
        if (!response.ok || !response.body) {
            const body = await response.json().catch(() => null);
            const error = createStreamError(body?.message || 'Failed to start workflow AI turn.', body?.code || 'WORKFLOW_AI_STREAM_START_FAILED');
            error.status = response.status;
            throw error;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            armInactivityTimeout();
            buffer += decoder.decode(value, { stream: true });
            const events = buffer.split('\n\n');
            buffer = events.pop() || '';
            for (const event of events) {
                if (!event.startsWith('data: ')) continue;
                let data;
                try { data = JSON.parse(event.substring(6)); } catch { continue; }
                if (data.type === 'progress') onProgress?.(data);
                if (data.type === 'complete') return data.result;
                if (data.type === 'error') {
                    const error = createStreamError(data.message, data.code || 'WORKFLOW_AI_FAILED');
                    error.issues = data.issues;
                    throw error;
                }
            }
        }
        throw createStreamError('Workflow AI turn ended before a result was received.', 'WORKFLOW_AI_STREAM_INCOMPLETE');
    } catch (error) {
        if (error.name === 'AbortError') throw createStreamError('Workflow AI turn timed out. Please try again.', 'WORKFLOW_AI_STREAM_TIMEOUT');
        throw error;
    } finally {
        clearTimeout(timeoutId);
    }
};
