import { getAIProvider } from './aiService.js';
import env from '../../config/env.js';
import fs from 'fs';
import path from 'path';
import { parseAiJson } from '../../utils/jsonParser.js';

import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const plannerInstructionPath = path.resolve(__dirname, './instruction/form/planner.md');
const workerInstructionPath = path.resolve(__dirname, './instruction/form/worker.md');

let plannerInstruction = 'You are an AI Form Planner.';
let workerInstruction = 'You are an AI Form Worker.';
try {
    plannerInstruction = fs.readFileSync(plannerInstructionPath, 'utf8');
    workerInstruction = fs.readFileSync(workerInstructionPath, 'utf8');
} catch (err) {
    console.error('Failed to read form instructions:', err);
}

const applySchemaPatches = (currentSchema, patches, plannerResult) => {
    let updatedSchema = { ...currentSchema };
    if (!updatedSchema.fields) updatedSchema.fields = [];
    
    if (plannerResult && plannerResult.aiMemory) {
        updatedSchema.settings = { ...(updatedSchema.settings || {}), aiMemory: plannerResult.aiMemory };
    }

    for (const patch of patches || []) {
        if (patch.op === 'add' && patch.field) {
            if (patch.insertAfter) {
                const index = updatedSchema.fields.findIndex(f => f.id === patch.insertAfter);
                if (index !== -1) {
                    updatedSchema.fields.splice(index + 1, 0, patch.field);
                } else {
                    updatedSchema.fields.push(patch.field);
                }
            } else {
                updatedSchema.fields.push(patch.field);
            }
        } else if (patch.op === 'remove' && patch.id) {
            const existingIndex = updatedSchema.fields.findIndex(f => f.id === patch.id);
            if (existingIndex !== -1) {
                const existing = updatedSchema.fields[existingIndex];
                patch.label = existing.label || existing.title || patch.id;
                patch.originalField = { ...existing };
                patch.originalIndex = existingIndex;
                updatedSchema.fields = updatedSchema.fields.filter(f => f.id !== patch.id);
            }
        } else if (patch.op === 'update' && patch.id && patch.updates) {
            const existingIndex = updatedSchema.fields.findIndex(f => f.id === patch.id);
            if (existingIndex !== -1) {
                const existing = updatedSchema.fields[existingIndex];
                patch.label = existing.label || existing.title || patch.id;
                patch.originalField = { ...existing };
                patch.originalIndex = existingIndex;
                updatedSchema.fields = updatedSchema.fields.map(f => f.id === patch.id ? { ...f, ...patch.updates } : f);
            }
        } else if (patch.op === 'update_meta' && patch.updates) {
            patch.originalMeta = { title: updatedSchema.title, description: updatedSchema.description };
            Object.assign(updatedSchema, patch.updates);
        }
    }
    return updatedSchema;
};

export const generateFormFromPrompt = async (prompt, currentSchema, chatHistory = [], onProgress = null) => {
    try {
        const provider = getAIProvider();

        if (onProgress) onProgress({ status: 'analyzing', message: 'Analyzing requirements...' });

        // 1. Prepare chat history for Planner Agent
        const contents = chatHistory.map(msg => ({
            role: msg.sender === 'user' ? 'user' : 'model',
            parts: [{ text: msg.text }]
        }));

        const currentRequestText = `Current Schema:\n${JSON.stringify(currentSchema || {})}\n\nUser Request:\n${prompt}`;
        contents.push({
            role: 'user',
            parts: [{ text: currentRequestText }]
        });

        // 2. Call the Planner Agent
        const plannerResponse = await provider.generateContent(contents, {
            systemInstruction: plannerInstruction,
            responseMimeType: 'application/json',
            model: env.aiModel
        });

        const plannerText = plannerResponse.text;
        let plannerResult;
        try {
            plannerResult = parseAiJson(plannerText);
        } catch (e) {
            console.error('Failed to parse Planner JSON response:', plannerText);
            throw new Error('Planner AI returned invalid JSON: ' + e.message);
        }

        if (!['message', 'plan_complete'].includes(plannerResult.type)) {
             throw new Error('Invalid planner response type generated: ' + plannerResult.type);
        }

        let tokenUsage = {};
        if (plannerResponse.usageMetadata) {
            tokenUsage = {
                promptTokens: plannerResponse.usageMetadata.promptTokenCount,
                completionTokens: plannerResponse.usageMetadata.candidatesTokenCount,
                totalTokens: plannerResponse.usageMetadata.totalTokenCount
            };
        }

        // If the planner needs to ask a question, return immediately
        if (plannerResult.type === 'message') {
            plannerResult.tokenUsage = tokenUsage;
            return plannerResult;
        }

        // 3. If planner is complete, Call the Worker Agent
        if (plannerResult.type === 'plan_complete') {
            if (onProgress) onProgress({ status: 'building', message: 'Generating form schema...' });
            const workerContents = [
                {
                    role: 'user',
                    parts: [{ text: `Current Schema:\n${JSON.stringify(currentSchema || {})}\n\nInstructions from Planner:\n${plannerResult.instructionsForWorker}` }]
                }
            ];

            const workerResponse = await provider.generateContent(workerContents, {
                systemInstruction: workerInstruction,
                responseMimeType: 'application/json',
                model: env.aiModel
            });

            const workerText = workerResponse.text;
            let result;
            try {
                result = parseAiJson(workerText);
            } catch (e) {
                console.error('Failed to parse Worker JSON response:', workerText);
                throw new Error('Worker AI returned invalid JSON: ' + e.message);
            }

            if (result.type !== 'proposal') {
                throw new Error('Invalid worker response type generated: ' + result.type);
            }

            if (workerResponse.usageMetadata) {
                tokenUsage.promptTokens += workerResponse.usageMetadata.promptTokenCount;
                tokenUsage.completionTokens += workerResponse.usageMetadata.candidatesTokenCount;
                tokenUsage.totalTokens += workerResponse.usageMetadata.totalTokenCount;
            }

            result.tokenUsage = tokenUsage;
            // Override the worker's internal message with the conversational summary from the planner
            result.message = plannerResult.summary || result.message;

            // 4. Apply patches to generate the full schema
            result.schema = applySchemaPatches(currentSchema, result.patches, plannerResult);

            return result;
        }
    } catch (error) {
        console.error('AI Service Error (Form Generation):', error);
        throw error;
    }
};
