import asyncHandler from '../../utils/asyncHandler.js';
import { getApprovalByToken, listApprovals, resolveApprovalForUser, resolveApprovalToken } from '../../services/engine/continuationService.js';

const safeContinuation = continuation => {
    const value = continuation?.toJSON ? continuation.toJSON() : { ...continuation };
    delete value.tokenHash;
    if (value.payload) delete value.payload.actionToken;
    return value;
};

export const getApprovals = asyncHandler(async (req, res) => {
    const approvals = await listApprovals({ userId: req.user.id });
    res.json(approvals.map(safeContinuation));
});

export const resolveApproval = asyncHandler(async (req, res) => {
    try {
        const result = await resolveApprovalToken({ token: req.params.token, decision: req.body?.decision, userId: req.user?.id || null });
        res.json({ success: true, continuation: safeContinuation(result.continuation), log: result.log });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

export const getApproval = asyncHandler(async (req, res) => {
    try {
        res.json(safeContinuation(await getApprovalByToken(req.params.token)));
    } catch (error) {
        res.status(404).json({ message: error.message });
    }
});

export const resolveApprovalForAccount = asyncHandler(async (req, res) => {
    try {
        const result = await resolveApprovalForUser({ id: req.params.id, decision: req.body?.decision, userId: req.user.id });
        res.json({ success: true, continuation: safeContinuation(result.continuation), log: result.log });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});
