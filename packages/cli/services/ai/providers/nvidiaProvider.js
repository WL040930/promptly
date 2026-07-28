import env from '../../../config/env.js';
import { DEFAULT_AI_MODELS } from '../../../config/aiConfig.js';
import { OpenAICompatibleProvider } from './openAICompatibleProvider.js';

/** NVIDIA's direct API is OpenAI-compatible, with optional thinking controls. */
export class NvidiaProvider extends OpenAICompatibleProvider {
    constructor({
        apiKey = env.nvidia.apiKey,
        timeoutMs = env.aiTimeoutMs,
        reasoningBudget = env.aiNvidiaReasoningBudget,
        enableThinking = env.aiNvidiaEnableThinking
    } = {}) {
        super({
            apiKey,
            baseUrl: 'https://integrate.api.nvidia.com/v1',
            displayName: 'NVIDIA',
            defaultModel: DEFAULT_AI_MODELS.nvidia,
            timeoutMs,
            requestBodyExtras: () => ({
                // The shared provider contract consumes one completed JSON response.
                stream: false,
                temperature: 1,
                top_p: 0.95,
                ...(enableThinking ? { chat_template_kwargs: { enable_thinking: true } } : {}),
                ...(Number.isInteger(reasoningBudget) && reasoningBudget > 0 ? { reasoning_budget: reasoningBudget } : {})
            })
        });
    }
}
