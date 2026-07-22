import env from '../../../config/env.js';

export const transcribeAudio = async ({ buffer, filename, mimeType, language = '', prompt = '', responseFormat = 'text', model = 'whisper-1' }) => {
    if (!env.openai.apiKey) throw new Error('OPENAI_API_KEY is required for transcription.');
    const form = new FormData();
    form.append('file', new Blob([buffer], { type: mimeType || 'audio/mpeg' }), filename || 'audio');
    form.append('model', model);
    if (language) form.append('language', language);
    if (prompt) form.append('prompt', prompt);
    form.append('response_format', responseFormat);
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${env.openai.apiKey}` }, body: form });
    if (!response.ok) throw new Error(`Transcription provider returned ${response.status}.`);
    const data = responseFormat === 'text' || responseFormat === 'srt' || responseFormat === 'vtt' ? await response.text() : await response.json();
    return typeof data === 'string' ? { text: data, language: language || null, duration: null, segments: [] } : { text: data.text || '', language: data.language || language || null, duration: data.duration || null, segments: data.segments || [] };
};
