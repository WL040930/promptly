import { ChatSession, ChatMessage } from '../../models/index.js';
import { Op } from 'sequelize';
import asyncHandler from '../../utils/asyncHandler.js';
import { processChatMessage, applyEvent, saveUserMessage } from '../../services/chat/chatAgentService.js';
import { mergeAgentContext } from '../../services/chat/resourceResolver.js';

export const sendMessage = asyncHandler(async (req, res) => {
    let { sessionId, message, context = {}, event } = req.body || {};
    const userId = req.user.id;
    let session = sessionId ? await ChatSession.findOne({ where: { id: sessionId, userId } }) : null;
    if (!session) {
        const titleSource = message || 'New Agent Session';
        session = await ChatSession.create({ userId, title: `${titleSource.substring(0, 40)}${titleSource.length > 40 ? '...' : ''}` });
    }

    if (event) {
        const eventResult = await applyEvent(session, userId, event);
        if (eventResult?.reply) return res.json({ sessionId: session.id, reply: eventResult.reply, tokenUsage: eventResult.tokenUsage || null });
        if (eventResult?.resume) {
            message = eventResult.resume.message;
            context = { ...context, ...eventResult.resume.context };
        } else if (!eventResult) {
            return res.status(400).json({ message: 'Unsupported agent event' });
        }
    }

    const userMessage = await saveUserMessage(session, message);
    const nextAgentContext = mergeAgentContext(session.agentContext || {}, context);
    if (JSON.stringify(nextAgentContext) !== JSON.stringify(session.agentContext || {})) {
        await session.update({ agentContext: nextAgentContext });
    }

    const { replyObj, totalTokenUsage } = await processChatMessage({ session, userId, context });

    return res.json({ sessionId: session.id, userMessage, reply: replyObj, tokenUsage: totalTokenUsage });
});

export const getSession = asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const { limit = 50, before } = req.query;
    const session = await ChatSession.findOne({ where: { id: sessionId, userId: req.user.id } });
    if (!session) return res.status(404).json({ message: 'Session not found' });
    const whereClause = { sessionId };
    if (before) {
        const cursorMsg = await ChatMessage.findByPk(before);
        if (cursorMsg) whereClause.createdAt = { [Op.lt]: cursorMsg.createdAt };
    }
    const messages = await ChatMessage.findAll({ where: whereClause, order: [['createdAt', 'ASC']], limit: parseInt(limit, 10) });
    
    const messagePayload = (msg) => {
        const json = msg.toJSON();
        return {
            id: json.id,
            sender: json.sender,
            text: json.text,
            createdAt: json.createdAt,
            kind: json.kind || 'text',
            payload: json.payload || null,
            proposalStatus: json.proposalStatus || null,
            tokenUsage: json.tokenUsage || null
        };
    };
    
    res.json({ ...session.toJSON(), messages: messages.map(messagePayload) });
});

export const getSessions = asyncHandler(async (req, res) => {
    const sessions = await ChatSession.findAll({ where: { userId: req.user.id }, order: [['updatedAt', 'DESC']], attributes: ['id', 'title', 'updatedAt', 'agentContext', 'agentState'], limit: 50 });
    res.json(sessions);
});

export const updateSession = asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const { title, agentContext } = req.body;
    const session = await ChatSession.findOne({ where: { id: sessionId, userId: req.user.id } });
    if (!session) return res.status(404).json({ message: 'Session not found' });
    await session.update({ title, ...(agentContext ? { agentContext } : {}) });
    res.json(session);
});

export const deleteSession = asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const session = await ChatSession.findOne({ where: { id: sessionId, userId: req.user.id } });
    if (!session) return res.status(404).json({ message: 'Session not found' });
    await session.destroy();
    res.json({ message: 'Session deleted' });
});
