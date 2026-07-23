import asyncHandler from '../../utils/asyncHandler.js';
import { getApprovalByToken, listApprovals, resolveApprovalForUser, resolveApprovalToken, serializeApproval } from '../../services/engine/continuationService.js';

export const getApprovals = asyncHandler(async (req, res) => {
    const approvals = await listApprovals({
        userId: req.user.id,
        status: req.query.status || 'pending',
        search: req.query.search || '',
        workflowId: req.query.workflowId || null,
        limit: req.query.limit,
        offset: req.query.offset
    });
    res.json(await Promise.all(approvals.map(serializeApproval)));
});

export const resolveApproval = asyncHandler(async (req, res) => {
    try {
        const result = await resolveApprovalToken({ token: req.params.token, decision: req.body?.decision, note: req.body?.note, userId: req.user?.id || null });
        res.json({ success: true, continuation: await serializeApproval(result.continuation), log: result.log });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

export const getApproval = asyncHandler(async (req, res) => {
    try {
        res.json(await serializeApproval(await getApprovalByToken(req.params.token)));
    } catch (error) {
        res.status(404).json({ message: error.message });
    }
});

export const resolveApprovalForAccount = asyncHandler(async (req, res) => {
    try {
        const result = await resolveApprovalForUser({ id: req.params.id, decision: req.body?.decision, note: req.body?.note, userId: req.user.id });
        res.json({ success: true, continuation: await serializeApproval(result.continuation), log: result.log });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});
