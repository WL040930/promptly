import { GoogleGenAI } from '@google/genai';
import env from '../config/env.js';

// Initialize the Gemini client
const ai = new GoogleGenAI({
    apiKey: env.gemini.apiKey
});

/**
 * Execute an AI prompt for a workflow node.
 */
export const executeNodePrompt = async (prompt, systemInstruction = '') => {
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3.5-flash',
            contents: prompt,
            config: {
                systemInstruction: systemInstruction || 'You are a helpful AI assistant.',
            }
        });
        return response.text;
    } catch (error) {
        console.error('Gemini API Error (Node):', error);
        throw error;
    }
};

/**
 * Handle Promptly Agent chat responses and propose nodes.
 */
export const chatWithAgent = async (messages) => {
    try {
        const recentMessages = messages.slice(-20);
        const chatPrompt = recentMessages.map(m => `${m.sender}: ${m.text}`).join('\n') + '\nbot:';
        
        const systemInstruction = `
        You are Promptly Agent, an AI assistant helping users build automation workflows.
        You can propose workflow nodes based on the user's intent. 
        If you want to propose a node, output it in JSON format at the very end of your response, wrapped in <PROPOSAL> tags.
        Example: <PROPOSAL>{"type": "ai", "title": "Extract Sentiment", "description": "Extracts sentiment from email"}</PROPOSAL>
        The types can be: 'trigger', 'action', or 'ai'.
        `;

        const response = await ai.models.generateContent({
            model: 'gemini-3.5-flash',
            contents: chatPrompt,
            config: {
                systemInstruction: systemInstruction,
            }
        });

        const reply = response.text;
        
        let text = reply;
        let proposal = null;
        
        const proposalMatch = reply.match(/<PROPOSAL>(.*?)<\/PROPOSAL>/s);
        if (proposalMatch) {
            try {
                proposal = JSON.parse(proposalMatch[1]);
                text = text.replace(proposalMatch[0], '').trim();
            } catch (e) {
                console.error("Failed to parse proposal JSON", e);
            }
        }

        return {
            id: Date.now().toString(),
            sender: 'bot',
            text: text,
            proposal: proposal
        };
    } catch (error) {
        console.error('Gemini API Error (Chat):', error);
        throw error;
    }
};
