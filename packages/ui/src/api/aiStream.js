import { apiBase } from './client.js';
import { getAuthToken } from '../utils/storage.js';

export const generateFormFromPromptStream = async (prompt, currentSchema, formId, onProgress) => {
    const headers = {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream'
    };
    const token = getAuthToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetch(`${apiBase}/api/forms/generate`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ prompt, currentSchema, formId })
    });

    if (!response.ok) {
        throw new Error('Failed to start stream');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    return new Promise(async (resolve, reject) => {
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n\n');
                buffer = lines.pop(); // Keep the last incomplete part in the buffer

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const dataStr = line.substring(6);
                        try {
                            const data = JSON.parse(dataStr);
                            if (data.type === 'progress') {
                                if (onProgress) onProgress(data);
                            } else if (data.type === 'complete') {
                                resolve(data.result);
                                return;
                            } else if (data.type === 'error') {
                                reject(new Error(data.message));
                                return;
                            }
                        } catch (e) {
                            console.error('Failed to parse SSE data:', e, dataStr);
                        }
                    }
                }
            }
            resolve(null); // Just in case it ends without a complete event
        } catch (error) {
            reject(error);
        }
    });
};
