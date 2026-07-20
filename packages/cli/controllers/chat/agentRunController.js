import asyncHandler from '../../utils/asyncHandler.js';
import { AgentRun } from '../../models/index.js';
import { approveAgentRun, rejectAgentRun } from '../../services/agent/agentApplyService.js';
import { serializeRun } from '../../services/agent/agentRunStore.js';

export const getRun = asyncHandler(async (req, res) => {
    const run = await AgentRun.findOne({ where: { id: req.params.runId, userId: req.user.id } });
    if (!run) return res.status(404).json({ code: 'AGENT_RUN_NOT_FOUND', message: 'Agent run not found.' });
    res.json(serializeRun(run));
});

export const cancelRun = asyncHandler(async (req, res) => {
    const run = await AgentRun.findOne({ where: { id: req.params.runId, userId: req.user.id } });
    if (!run) return res.status(404).json({ code: 'AGENT_RUN_NOT_FOUND', message: 'Agent run not found.' });
    if (['completed', 'failed', 'blocked', 'cancelled'].includes(run.status)) return res.json(serializeRun(run));
    await run.update({
        status: 'cancelled',
        currentStep: null,
        error: { code: 'AGENT_CANCELLED', message: 'The user cancelled this agent run.' }
    });
    res.json(serializeRun(run));
});

export const approveRun = asyncHandler(async (req, res) => {
    const idempotencyKey = req.body?.idempotencyKey || req.get('Idempotency-Key');
    const result = await approveAgentRun({ runId: req.params.runId, userId: req.user.id, idempotencyKey });
    res.json(result);
});

export const rejectRun = asyncHandler(async (req, res) => {
    const result = await rejectAgentRun({ runId: req.params.runId, userId: req.user.id });
    res.json(result);
});
