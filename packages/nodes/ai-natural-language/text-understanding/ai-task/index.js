import { BaseNode } from '../../../BaseNode.js';
import { getAITaskConfig, getAIProviderForTask } from '../../../../cli/services/ai/core/aiService.js';
import env from '../../../../cli/config/env.js';
import { parseAiJson } from '../../../../cli/utils/jsonParser.js';

const SYSTEM_PROMPTS = {
    summarize: 'You are a summarization assistant. Produce a concise, accurate summary of the provided text. Return only the summary, no preamble.',
    extract: 'You are a data extraction assistant. Extract the requested fields from the provided text and return a valid JSON object matching the schema provided. Return only the JSON object, no preamble or markdown.',
    sentiment: 'You are a sentiment analysis assistant. Analyze the sentiment of the provided text. Return a JSON object with two keys: "sentiment" (one of: "positive", "negative", "neutral") and "confidence" (a number from 0 to 1). Return only the JSON, no preamble.',
    categorize: 'You are a text classification assistant. Categorize the provided text into exactly one of the categories listed. Return a JSON object with two keys: "category" (the matched category string) and "confidence" (a number from 0 to 1). Return only the JSON, no preamble.',
    custom: ''
};

const buildPrompt = (taskType, userPrompt, extractionSchema, categories, inputData) => {
    const source = userPrompt || '{{inputData}}';
    const resolvedSource = source.replaceAll('{{inputData}}', typeof inputData === 'string' ? inputData : JSON.stringify(inputData ?? ''));
    switch (taskType) {
        case 'extract': return `Extract the following fields from the text below.\n\nSchema: ${extractionSchema || '{}'}\n\nText:\n${resolvedSource}`;
        case 'sentiment': return `Analyze the sentiment of the following text:\n\n${resolvedSource}`;
        case 'categorize': return `Categorize the following text into one of these categories: ${categories || 'general'}.\n\nText:\n${resolvedSource}`;
        case 'summarize': return resolvedSource;
        case 'custom':
        default: return resolvedSource;
    }
};

const structuredTasks = new Set(['extract', 'sentiment', 'categorize']);

export default class AITaskNode extends BaseNode {
    async execute(context) {
        const config = this.getResolvedConfig(context);
        const taskType = config.taskType || 'custom';
        const taskConfig = getAITaskConfig('node');
        const model = config.model || taskConfig.model;
        const prompt = buildPrompt(taskType, config.prompt, config.extractionSchema, config.categories, config.inputData || context.initialPayload);
        const systemPrompt = config.systemPrompt || SYSTEM_PROMPTS[taskType] || '';
        const provider = getAIProviderForTask('node');
        const response = await provider.generateContent([{ role: 'user', parts: [{ text: prompt }] }], {
            systemInstruction: systemPrompt,
            model,
            responseMimeType: structuredTasks.has(taskType) ? 'application/json' : undefined,
            maxCompletionTokens: env.aiNodeMaxCompletionTokens,
            operation: 'node:ai-task'
        });

        const responseText = String(response.text || '').trim();
        let parsedResponse = null;
        if (structuredTasks.has(taskType)) {
            try {
                parsedResponse = parseAiJson(responseText);
            } catch (error) {
                throw new Error(`AI Task expected JSON output but received invalid JSON: ${error.message}`);
            }
        }

        const usage = response.usageMetadata || {};
        const tokensUsed = usage.totalTokenCount || ((usage.promptTokenCount || 0) + (usage.candidatesTokenCount || 0));
        return {
            success: true,
            taskType,
            model,
            response: responseText,
            parsedResponse,
            tokensUsed
        };
    }
}
