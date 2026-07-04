import { chatWithAgent } from '../../services/ai/aiService.js';
import { ChatSession, ChatMessage } from '../../models/index.js';
import { Op } from 'sequelize';
import asyncHandler from '../../utils/asyncHandler.js';

export const sendMessage = asyncHandler(async (req, res) => {
    const { sessionId, message } = req.body;
    const userId = req.user.id;

    let session;
    if (sessionId) {
        session = await ChatSession.findOne({ where: { id: sessionId, userId } });
    }

    if (!session) {
        // Generate title from first message
        const title = message.substring(0, 40) + (message.length > 40 ? '...' : '');
        session = await ChatSession.create({ userId, title });
    }

    // Persist the user message
    await ChatMessage.create({ sessionId: session.id, sender: 'user', text: message });

    // Build conversation history for the AI (last 20 messages for context)
    const history = await ChatMessage.findAll({
        where: { sessionId: session.id },
        order: [['createdAt', 'DESC']],
        limit: 20,
        attributes: ['sender', 'text']
    });

    // Reverse to chronological order for the AI
    const historyForAI = history.reverse().map(m => ({ sender: m.sender, text: m.text }));
    const botReply = await chatWithAgent(historyForAI);

    // Persist the bot reply
    const savedReply = await ChatMessage.create({
        sessionId: session.id,
        sender: botReply.sender || 'bot',
        text: botReply.text
    });

    res.json({ sessionId: session.id, reply: { id: savedReply.id, sender: savedReply.sender, text: savedReply.text } });
});

export const getSession = asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const { limit = 50, before } = req.query;

    const session = await ChatSession.findOne({ where: { id: sessionId, userId: req.user.id } });
    if (!session) return res.status(404).json({ message: 'Session not found' });

    const whereClause = { sessionId };
    if (before) {
        // Cursor-based pagination: fetch messages older than the given message id
        const cursorMsg = await ChatMessage.findByPk(before);
        if (cursorMsg) whereClause.createdAt = { [Op.lt]: cursorMsg.createdAt };
    }

    const messages = await ChatMessage.findAll({
        where: { sessionId },
        order: [['createdAt', 'ASC']],
        limit: parseInt(limit, 10),
        attributes: ['id', 'sender', 'text', 'createdAt']
    });

    res.json({ ...session.toJSON(), messages });
});

export const getSessions = asyncHandler(async (req, res) => {
    const sessions = await ChatSession.findAll({
        where: { userId: req.user.id },
        order: [['updatedAt', 'DESC']],
        attributes: ['id', 'title', 'updatedAt'],
        limit: 50
    });
    res.json(sessions);
});

export const updateSession = asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const { title } = req.body;
    const session = await ChatSession.findOne({ where: { id: sessionId, userId: req.user.id } });
    if (!session) return res.status(404).json({ message: 'Session not found' });

    await session.update({ title });
    res.json(session);
});

export const deleteSession = asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const session = await ChatSession.findOne({ where: { id: sessionId, userId: req.user.id } });
    if (!session) return res.status(404).json({ message: 'Session not found' });

    await session.destroy(); // CASCADE deletes ChatMessages via association
    res.json({ message: 'Session deleted' });
});
