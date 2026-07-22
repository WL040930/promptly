import env from '../../../config/env.js';

export const createEmbedding = async text => {
    if (!env.openai.apiKey) throw new Error('OPENAI_API_KEY is required for knowledge-base embeddings.');
    const response = await fetch('https://api.openai.com/v1/embeddings', { method: 'POST', headers: { Authorization: `Bearer ${env.openai.apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'text-embedding-3-small', input: text }) });
    if (!response.ok) throw new Error(`Embedding provider returned ${response.status}.`);
    const data = await response.json();
    return data.data?.[0]?.embedding || [];
};
