import asyncHandler from '../../utils/asyncHandler.js';
import { getApprovalSummary as getApprovalSummaryForUser, listApprovals, resolveApprovalForUser, serializeApproval } from '../../services/engine/continuationService.js';
import { Form, FormResponse } from '../../models/index.js';

export const getApprovals = asyncHandler(async (req, res) => {
    const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
    const pageSize = Math.min(Math.max(Number.parseInt(req.query.pageSize, 10) || 25, 1), 100);
    const { rows, count } = await listApprovals({
        userId: req.user.id,
        status: req.query.status || 'pending',
        search: req.query.search || '',
        workflowId: req.query.workflowId || null,
        limit: pageSize,
        offset: (page - 1) * pageSize
    });
    const responseIds = [...new Set(rows.map(item => item.payload?.input?.responseId).filter(Boolean))];
    const responses = responseIds.length > 0
        ? await FormResponse.findAll({ where: { id: responseIds }, include: [{ model: Form, as: 'form', attributes: ['id', 'title'] }] })
        : [];
    const responsesById = new Map(responses.map(response => [response.id, response]));
    res.json({
        data: await Promise.all(rows.map(approval => serializeApproval(approval, { responsesById }))),
        pagination: { page, pageSize, total: count, totalPages: Math.max(Math.ceil(count / pageSize), 1) }
    });
});

export const getApprovalSummary = asyncHandler(async (req, res) => {
    res.json(await getApprovalSummaryForUser(req.user.id));
});

export const resolveApprovalForAccount = asyncHandler(async (req, res) => {
    try {
        const result = await resolveApprovalForUser({ id: req.params.id, decision: req.body?.decision, note: req.body?.note, userId: req.user.id });
        res.json({ success: true, continuation: await serializeApproval(result.continuation), log: result.log });
    } catch (error) {
        res.status(error.status || 400).json({ message: error.message, code: error.code || null });
    }
});
