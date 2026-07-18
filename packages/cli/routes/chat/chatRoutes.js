import { Router } from 'express';
import asyncHandler from '../../utils/asyncHandler.js';
import { requireAuth } from '../../middleware/authMiddleware.js';
import { sendMessage, getSession, getSessions, updateSession, deleteSession } from '../../controllers/chat/chatController.js';
import { getAgentRun, approveRun, rejectRun } from '../../controllers/chat/agentRunController.js';

const router = Router();

router.use(requireAuth);
router.post('/message', asyncHandler(sendMessage));
router.get('/', asyncHandler(getSessions));
router.get('/:sessionId', asyncHandler(getSession));
router.put('/:sessionId', asyncHandler(updateSession));
router.delete('/:sessionId', asyncHandler(deleteSession));
router.get('/agent-runs/:runId', asyncHandler(getAgentRun));
router.post('/agent-runs/:runId/approve', asyncHandler(approveRun));
router.post('/agent-runs/:runId/reject', asyncHandler(rejectRun));

export default router;
