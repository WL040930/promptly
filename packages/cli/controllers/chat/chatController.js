import { chatWithAgent } from '../../services/geminiService.js';
import { ChatSession } from '../../models/index.js';

export const sendMessage = async (req, res) => {
    const { sessionId, message } = req.body;
    const userId = req.user.id;
    
    try {
        let session;
        if (sessionId) {
            session = await ChatSession.findOne({ where: { id: sessionId, userId } });
        }
        
        if (!session) {
            // Generate title from first message
            const title = message.substring(0, 40) + (message.length > 40 ? '...' : '');
            session = await ChatSession.create({ userId, messages: [], title });
        }
        
        // Append user message
        const updatedMessages = [...(session.messages || []), { id: Date.now().toString(), sender: 'user', text: message }];
        
        // Get bot reply via Gemini
        const botReply = await chatWithAgent(updatedMessages);
        
        // Append bot reply
        updatedMessages.push(botReply);
        
        // Save session
        await session.update({ messages: updatedMessages });
        
        res.json({ sessionId: session.id, reply: botReply });
    } catch (error) {
        console.error('Chat Error:', error);
        res.status(500).json({ message: 'Failed to process chat message' });
    }
};

export const getSession = async (req, res) => {
    const { sessionId } = req.params;
    const session = await ChatSession.findOne({ where: { id: sessionId, userId: req.user.id } });
    if (!session) return res.status(404).json({ message: 'Session not found' });
    res.json(session);
};

export const getSessions = async (req, res) => {
    const sessions = await ChatSession.findAll({
        where: { userId: req.user.id },
        order: [['updatedAt', 'DESC']],
        attributes: ['id', 'title', 'updatedAt']
    });
    res.json(sessions);
};
