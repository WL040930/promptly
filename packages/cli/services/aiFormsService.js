import { GoogleGenAI } from '@google/genai';
import env from '../config/env.js';

// Initialize the Gemini client
const ai = new GoogleGenAI({
    apiKey: env.gemini.apiKey
});

export const generateFormFromPrompt = async (prompt) => {
    try {
        const systemInstruction = `
        You are an expert form designer. The user will provide a prompt describing the kind of form they want to create.
        Your task is to generate a complete form schema in JSON format.
        
        The JSON must contain the following structure exactly:
        {
            "title": "String - A short, clear title for the form",
            "description": "String - A helpful description of the form's purpose",
            "fields": [
                {
                    "id": "String - A unique ID like 'f_1234_abcd'",
                    "type": "String - MUST be one of: 'text', 'email', 'textarea', 'dropdown', 'checkbox', 'radio', 'date', 'heading'",
                    "label": "String - The question or heading text",
                    "required": "Boolean - Whether the field is required (usually true for main questions, false for headings/optional)",
                    "options": "Array of strings - ONLY if type is 'dropdown', 'checkbox', or 'radio'. Otherwise, omit this property."
                }
            ]
        }
        
        Ensure you generate a well-structured form with a logical flow. Do not use any types outside of the allowed list. 
        Return ONLY valid JSON, no markdown formatting.
        `;

        const response = await ai.models.generateContent({
            model: 'gemini-3.5-flash',
            contents: prompt,
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
