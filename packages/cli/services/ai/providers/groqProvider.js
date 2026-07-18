import env from '../../../config/env.js';
import { OpenAICompatibleProvider } from './openAICompatibleProvider.js';

export class GroqProvider extends OpenAICompatibleProvider {
    constructor({ apiKey = env.groq.apiKey, timeoutMs = env.aiTimeoutMs } = {}) {
        super({
            apiKey,
            baseUrl: 'https://api.groq.com/openai/v1',
            displayName: 'Groq',
            defaultModel: 'llama3-8b-8192',
            timeoutMs
        });
    }
}
