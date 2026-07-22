import env from '../../../config/env.js';
import { DEFAULT_AI_MODELS } from '../../../config/aiConfig.js';
import { OpenAICompatibleProvider } from './openAICompatibleProvider.js';

export class OpenRouterProvider extends OpenAICompatibleProvider {
    constructor({ apiKey = env.openrouter.apiKey, timeoutMs = env.aiTimeoutMs } = {}) {
        super({
            apiKey,
            baseUrl: 'https://openrouter.ai/api/v1',
            displayName: 'OpenRouter',
            defaultModel: DEFAULT_AI_MODELS.openrouter,
            timeoutMs
        });
    }
}
