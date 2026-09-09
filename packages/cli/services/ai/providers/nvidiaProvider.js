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
            requestBodyExtras: options => {
                const machineReadableJson = options.responseMimeType === 'application/json';
                return {
                    // The shared provider contract consumes one completed JSON response.
                    stream: false,
                    // Nemotron recommends this sampling pair across its supported tasks.
                    temperature: 1,
                    top_p: 0.95,
                    // A reasoning trace is useful for normal chat, but JSON consumers must
                    // receive only the final machine-readable object.
                    ...(machineReadableJson
                        ? { chat_template_kwargs: { enable_thinking: false } }
                        : enableThinking ? { chat_template_kwargs: { enable_thinking: true } } : {}),
                    ...(!machineReadableJson && Number.isInteger(reasoningBudget) && reasoningBudget > 0
                        ? { reasoning_budget: reasoningBudget }
                        : {})
                };
            }
        });
    }
}
