import asyncHandler from '../../utils/asyncHandler.js';
import { getRunForUser, serializeRun } from '../../services/agent/agentRunStore.js';
import { approveAgentRun, rejectAgentRun } from '../../services/agent/agentApplyService.js';

export const getAgentRun = asyncHandler(async (req, res) => {
    const run = await getRunForUser(req.params.runId, req.user.id);
    if (!run) return res.status(404).json({ message: 'Agent run not found.' });
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
