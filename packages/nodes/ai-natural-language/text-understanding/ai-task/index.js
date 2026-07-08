import { BaseNode } from '../../../BaseNode.js';

// Default system prompts per task type
const SYSTEM_PROMPTS = {
    summarize: 'You are a summarization assistant. Produce a concise, accurate summary of the provided text. Return only the summary, no preamble.',
    extract: 'You are a data extraction assistant. Extract the requested fields from the provided text and return a valid JSON object matching the schema provided. Return only the JSON object, no preamble or markdown.',
    sentiment: 'You are a sentiment analysis assistant. Analyze the sentiment of the provided text. Return a JSON object with two keys: "sentiment" (one of: "positive", "negative", "neutral") and "confidence" (a number from 0 to 1). Return only the JSON, no preamble.',
    categorize: 'You are a text classification assistant. Categorize the provided text into exactly one of the categories listed. Return a JSON object with two keys: "category" (the matched category string) and "confidence" (a number from 0 to 1). Return only the JSON, no preamble.',
    custom: '',
};

// Build the full prompt for each task type
function buildPrompt(taskType, userPrompt, extractionSchema, categories) {
    switch (taskType) {
        case 'summarize':
            return userPrompt || 'Summarize the following text:\n\n{{inputData}}';
        case 'extract':
            return `Extract the following fields from the text below.\n\nSchema: ${extractionSchema || '{}'}\n\nText:\n${userPrompt || '{{inputData}}'}`;
        case 'sentiment':
            return `Analyze the sentiment of the following text:\n\n${userPrompt || '{{inputData}}'}`;
        case 'categorize':
            return `Categorize the following text into one of these categories: ${categories || 'general'}.\n\nText:\n${userPrompt || '{{inputData}}'}`;
        case 'custom':
        default:
            return userPrompt || '';
    }
}

export default class AITaskNode extends BaseNode {
    async execute(context) {
        const config = this.getResolvedConfig(context);
        const {
            taskType    = 'custom',
            prompt      = '',
            model       = 'gpt-4o',
            systemPrompt,
            extractionSchema,
            categories,
        } = config;

        const builtPrompt  = buildPrompt(taskType, prompt, extractionSchema, categories);
        const finalSystem  = systemPrompt || SYSTEM_PROMPTS[taskType] || '';

        // ── Actual LLM call would go here ─────────────────────────────────────
        // Example integration point:
        //
        // const { response, tokensUsed } = await callLLM({
        //     model,
        //     systemPrompt: finalSystem,
        //     userPrompt: builtPrompt,
        // });
        //
        // For now we return a structured stub so the variable picker has
        // real field paths to work with (response, tokensUsed, model, taskType).
        // ──────────────────────────────────────────────────────────────────────

        const stubResponse  = `[AI Task stub] taskType=${taskType} model=${model} prompt="${builtPrompt.slice(0, 80)}..."`;
        const stubTokens    = Math.floor(builtPrompt.length / 4); // rough estimate

        return {
            success:   true,
            taskType,
            model,
            response:  stubResponse,
            tokensUsed: stubTokens,
        };
    }
}
