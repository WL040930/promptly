import { Router } from 'express';
import { requireAuth } from '../../middleware/authMiddleware.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { getApprovals, getApprovalSummary, resolveApprovalForAccount } from '../../controllers/system/continuationController.js';

const router = Router();
router.get('/approvals', requireAuth, asyncHandler(getApprovals));
router.get('/approvals/summary', requireAuth, asyncHandler(getApprovalSummary));
router.post('/approvals/id/:id/resolve', requireAuth, asyncHandler(resolveApprovalForAccount));
export default router;
