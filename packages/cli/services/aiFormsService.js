import { GoogleGenAI } from '@google/genai';
import env from '../config/env.js';
import fs from 'fs';
import path from 'path';

// Initialize the Gemini client
const ai = new GoogleGenAI({
    apiKey: env.gemini.apiKey
});

export const generateFormFromPrompt = async (prompt, currentSchema) => {
    try {
        const instructionPath = path.resolve('../ui/src/forms/instruction/instruction.md');
        let systemInstruction = '';
        try {
            systemInstruction = fs.readFileSync(instructionPath, 'utf8');
        } catch (err) {
            console.error('Failed to read instruction.md:', err);
            systemInstruction = 'You are an AI Form Designer. Output a full JSON form schema with title, description, and fields array.';
        }

        const contents = `Current Schema:\n${JSON.stringify(currentSchema || {}, null, 2)}\n\nUser Request:\n${prompt}`;

        const response = await ai.models.generateContent({
            model: 'gemini-3.5-flash',
            contents: contents,
            config: {
                systemInstruction: systemInstruction,
                responseMimeType: 'application/json',
            }
        });

        const text = response.text;
        const schema = JSON.parse(text);
        
        // Basic validation
        if (!schema.title || !Array.isArray(schema.fields)) {
             throw new Error('Invalid schema generated');
        }

        return schema;
    } catch (error) {
        console.error('Gemini API Error (Form Generation):', error);
        throw error;
    }
};
