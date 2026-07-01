import { GoogleGenAI } from '@google/genai';
import env from '../config/env.js';
import fs from 'fs';
import path from 'path';

// Initialize the Gemini client
const ai = new GoogleGenAI({
    apiKey: env.gemini.apiKey
});

export const generateFormFromPrompt = async (prompt, currentSchema, chatHistory = []) => {
    try {
        const instructionPath = path.resolve('../ui/src/forms/instruction/instruction.md');
        let systemInstruction = '';
        try {
            systemInstruction = fs.readFileSync(instructionPath, 'utf8');
        } catch (err) {
            console.error('Failed to read instruction.md:', err);
            systemInstruction = 'You are an AI Form Designer. Output a full JSON form schema with title, description, and fields array.';
        }

        // Map chat history to Gemini format
        const contents = chatHistory.map(msg => ({
            role: msg.sender === 'user' ? 'user' : 'model',
            parts: [{ text: msg.text }]
        }));

        // Append current request (minified JSON to save tokens and speed up AI processing)
        const currentRequestText = `Current Schema:\n${JSON.stringify(currentSchema || {})}\n\nUser Request:\n${prompt}`;
        contents.push({
            role: 'user',
            parts: [{ text: currentRequestText }]
        });

        const response = await ai.models.generateContent({
            model: 'gemini-3.5-flash',
            contents: contents,
            config: {
                systemInstruction: systemInstruction,
                responseMimeType: 'application/json',
            }
        });

        const text = response.text;
        const result = JSON.parse(text);
        
        // Basic validation
        if (!result.type || !['message', 'proposal'].includes(result.type)) {
             throw new Error('Invalid response type generated');
        }

        // Attach token usage
        if (response.usageMetadata) {
            result.tokenUsage = {
                promptTokens: response.usageMetadata.promptTokenCount,
                completionTokens: response.usageMetadata.candidatesTokenCount,
                totalTokens: response.usageMetadata.totalTokenCount
            };
        }

        // Apply patches to generate the full schema if it's a proposal
        if (result.type === 'proposal') {
            let updatedSchema = { ...currentSchema };
            if (!updatedSchema.fields) updatedSchema.fields = [];

            for (const patch of result.patches || []) {
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
                    const existing = updatedSchema.fields.find(f => f.id === patch.id);
                    if (existing) patch.label = existing.label || existing.title || patch.id;
                    updatedSchema.fields = updatedSchema.fields.filter(f => f.id !== patch.id);
                } else if (patch.op === 'update' && patch.id && patch.updates) {
                    const existing = updatedSchema.fields.find(f => f.id === patch.id);
                    if (existing) patch.label = existing.label || existing.title || patch.id;
                    updatedSchema.fields = updatedSchema.fields.map(f => f.id === patch.id ? { ...f, ...patch.updates } : f);
                } else if (patch.op === 'update_meta' && patch.updates) {
                    Object.assign(updatedSchema, patch.updates);
                }
            }
            result.schema = updatedSchema;
            // Retain result.patches so frontend can render diffs
        }

        return result;
    } catch (error) {
        console.error('Gemini API Error (Form Generation):', error);
        throw error;
    }
};
