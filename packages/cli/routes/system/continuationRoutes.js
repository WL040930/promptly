import { Router } from 'express';
import { requireAuth } from '../../middleware/authMiddleware.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { getApproval, getApprovals, resolveApproval, resolveApprovalForAccount } from '../../controllers/system/continuationController.js';

const router = Router();
router.get('/approvals', requireAuth, asyncHandler(getApprovals));
router.get('/approvals/token/:token', asyncHandler(getApproval));
router.post('/approvals/id/:id/resolve', requireAuth, asyncHandler(resolveApprovalForAccount));
router.post('/approvals/:token/resolve', resolveApproval);
export default router;
