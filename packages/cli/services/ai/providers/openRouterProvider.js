import env from '../../../config/env.js';
import { OpenAICompatibleProvider } from './openAICompatibleProvider.js';

export class OpenRouterProvider extends OpenAICompatibleProvider {
    constructor({ apiKey = env.openrouter.apiKey, timeoutMs = env.aiTimeoutMs } = {}) {
        super({
            apiKey,
            baseUrl: 'https://openrouter.ai/api/v1',
            displayName: 'OpenRouter',
            defaultModel: 'openai/gpt-4o-mini',
            timeoutMs
        });
    }
}
