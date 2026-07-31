import { AssistantMessage, AssistantThread } from '../../models/index.js';
import { Op } from 'sequelize';
import asyncHandler from '../../utils/asyncHandler.js';
import { processChatMessage, applyEvent, decideChatProposal, saveUserMessage } from '../../services/chat/chatAgentService.js';
import { mergeAgentContext } from '../../services/chat/resourceResolver.js';

export const createSendMessageHandler = ({
    chatSessionModel = AssistantThread,
    applyEventService = applyEvent,
    processChatMessageService = processChatMessage,
    saveUserMessageService = saveUserMessage,
    mergeAgentContextService = mergeAgentContext
} = {}) => asyncHandler(async (req, res) => {
    let { sessionId, message, context = {}, event } = req.body || {};
    const userId = req.user.id;
    const useSSE = String(req.headers.accept || '').includes('text/event-stream');
    // Ask Promptly is the workspace coordinator. A selected workflow is
    // context for its specialist delegation, not a reason to reject the turn.
    if (context?.automationId && !context.workflowId) context = { ...context, workflowId: context.automationId };
    if (useSSE) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders?.();
    }
    const emit = data => {
        if (useSSE && !res.writableEnded) res.write(`data: ${JSON.stringify(data)}\n\n`);
    };
    let session = sessionId ? await chatSessionModel.findOne({ where: { id: sessionId, userId } }) : null;
    if (!session) {
        const titleSource = message || 'New Agent Session';
        session = await chatSessionModel.create({
            userId,
            surface: 'ask_promptly',
            context: {},
            state: { version: 1, phase: 'idle', mode: 'important_only' },
            title: `${titleSource.substring(0, 40)}${titleSource.length > 40 ? '...' : ''}`
        });
    }
    const heartbeat = useSSE ? setInterval(() => emit({ type: 'turn.heartbeat' }), 15_000) : null;

    try {
    if (event) {
        const eventResult = await applyEventService(session, userId, event, emit);
        if (eventResult?.reply) {
            const payload = { sessionId: session.id, reply: eventResult.reply, tokenUsage: eventResult.tokenUsage || null };
            if (useSSE) {
                emit({ type: 'turn.completed', result: payload });
                return res.end();
            }
            return res.json(payload);
        }
        if (eventResult?.resume) {
            message = eventResult.resume.message;
            context = { ...context, ...eventResult.resume.context };
        } else if (!eventResult) {
            return res.status(400).json({ message: 'Unsupported agent event' });
        }
    }

    const userMessage = await saveUserMessageService(session, message);
    const nextAgentContext = mergeAgentContextService(session.context || {}, context);
    if (JSON.stringify(nextAgentContext) !== JSON.stringify(session.context || {})) {
        await session.update({ context: nextAgentContext });
    }

    const { replyObj, totalTokenUsage } = await processChatMessageService({ session, userId, context, onEvent: emit });

    const payload = { sessionId: session.id, userMessage, reply: replyObj, tokenUsage: totalTokenUsage };
    if (useSSE) {
        emit({ type: 'turn.completed', result: payload });
        return res.end();
    }
    return res.json(payload);
    } catch (error) {
        if (useSSE && !res.writableEnded) {
            emit({ type: 'turn.failed', code: error.code || 'ASSISTANT_TURN_FAILED', message: error.message || 'Assistant turn failed.' });
            return res.end();
        }
        throw error;
    } finally {
        if (heartbeat) clearInterval(heartbeat);
    }
});

export const sendMessage = createSendMessageHandler();

export const getSession = asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const { limit = 50, before } = req.query;
    const session = await AssistantThread.findOne({ where: { id: sessionId, userId: req.user.id, surface: 'ask_promptly' } });
    if (!session) return res.status(404).json({ message: 'Session not found' });
    const whereClause = { threadId: sessionId };
    if (before) {
        const cursorMsg = await AssistantMessage.findOne({ where: { id: before, threadId: sessionId } });
        if (cursorMsg) whereClause.createdAt = { [Op.lt]: cursorMsg.createdAt };
    }
    const messages = await AssistantMessage.findAll({ where: whereClause, order: [['createdAt', 'DESC']], limit: parseInt(limit, 10) });
    
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
            tokenUsage: json.tokenUsage || null,
            errorMetadata: json.errorMetadata || null,
            isError: json.isError === true
        };
    };
    
    res.json({
        id: session.id,
        userId: session.userId,
        title: session.title,
        updatedAt: session.updatedAt,
        purpose: 'general',
        agentContext: session.context || {},
        agentState: session.state || {},
        messages: messages.reverse().map(messagePayload)
    });
});

export const decideProposal = asyncHandler(async (req, res) => {
    const session = await AssistantThread.findOne({ where: { id: req.body?.sessionId, userId: req.user.id, surface: 'ask_promptly' } });
    if (!session) return res.status(404).json({ message: 'Session not found' });
    const result = await decideChatProposal({
        session,
        userId: req.user.id,
        messageId: req.params.messageId,
        action: req.body?.action || 'approve',
        overrides: req.body?.overrides || null
    });
    res.json(result);
});

export const getSessions = asyncHandler(async (req, res) => {
    const sessions = await AssistantThread.findAll({ where: { userId: req.user.id, surface: 'ask_promptly' }, order: [['updatedAt', 'DESC']], attributes: ['id', 'title', 'updatedAt', 'context', 'state', 'surface'], limit: 50 });
    res.json(sessions.map(session => ({
        id: session.id,
        title: session.title,
        updatedAt: session.updatedAt,
        purpose: 'general',
        agentContext: session.context || {},
        agentState: session.state || {}
    })));
});

export const deleteSession = asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const session = await AssistantThread.findOne({ where: { id: sessionId, userId: req.user.id, surface: 'ask_promptly' } });
    if (!session) return res.status(404).json({ message: 'Session not found' });
    await session.destroy();
    res.json({ message: 'Session deleted' });
});
