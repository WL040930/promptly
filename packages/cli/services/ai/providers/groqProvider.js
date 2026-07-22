import env from '../../../config/env.js';
import { DEFAULT_AI_MODELS } from '../../../config/aiConfig.js';
import { OpenAICompatibleProvider } from './openAICompatibleProvider.js';

export class GroqProvider extends OpenAICompatibleProvider {
    constructor({ apiKey = env.groq.apiKey, timeoutMs = env.aiTimeoutMs } = {}) {
        super({
            apiKey,
            baseUrl: 'https://api.groq.com/openai/v1',
            displayName: 'Groq',
            defaultModel: DEFAULT_AI_MODELS.groq,
            timeoutMs
        });
    }
}
