import env from '../../config/env.js';
import { GeminiProvider } from './providers/geminiProvider.js';
import { OpenRouterProvider } from './providers/openRouterProvider.js';
import { GroqProvider } from './providers/groqProvider.js';
import { CerebrasProvider } from './providers/cerebrasProvider.js';

let providerInstance = null;

export const getAIProvider = () => {
    if (providerInstance) return providerInstance;

    const providerName = env.aiProvider || 'gemini';
        if (env.aiProvider === 'openrouter') {
            providerInstance = new OpenRouterProvider();
        } else if (env.aiProvider === 'groq') {
            providerInstance = new GroqProvider();
        } else if (env.aiProvider === 'cerebras') {
            providerInstance = new CerebrasProvider();
        } else {
            providerInstance = new GeminiProvider();
        }  
    return providerInstance;
};

/**
 * Execute an AI prompt for a workflow node.
 */
export const executeNodePrompt = async (prompt, systemInstruction = '') => {
    try {
        const provider = getAIProvider();
        const response = await provider.generateContent([{ role: 'user', parts: [{ text: prompt }] }], {
            systemInstruction: systemInstruction || 'You are a helpful AI assistant.',
            model: env.aiModel
        });
        return response.text;
    } catch (error) {
        console.error('AI Service Error (Node):', error);
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

        const provider = getAIProvider();
        const response = await provider.generateContent([{ role: 'user', parts: [{ text: chatPrompt }] }], {
            systemInstruction: systemInstruction,
            model: env.aiModel
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
        console.error('AI Service Error (Chat):', error);
        throw error;
    }
};
