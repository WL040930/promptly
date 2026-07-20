import { Router } from 'express';
import asyncHandler from '../../utils/asyncHandler.js';
import { requireAuth } from '../../middleware/authMiddleware.js';
import { sendMessage, getSession, getSessions, deleteSession, decideProposal } from '../../controllers/chat/chatController.js';
import { approveRun, rejectRun, getRun, cancelRun } from '../../controllers/chat/agentRunController.js';

const router = Router();

router.use(requireAuth);
router.post('/message', asyncHandler(sendMessage));
router.post('/turns', asyncHandler(sendMessage));
router.post('/proposals/:messageId/decision', asyncHandler(decideProposal));
router.get('/', asyncHandler(getSessions));
router.get('/conversations', asyncHandler(getSessions));
router.get('/:sessionId', asyncHandler(getSession));
router.get('/conversations/:sessionId/messages', asyncHandler(getSession));
router.delete('/:sessionId', asyncHandler(deleteSession));
router.get('/agent-runs/:runId', asyncHandler(getRun));
router.post('/agent-runs/:runId/cancel', asyncHandler(cancelRun));
router.post('/agent-runs/:runId/approve', asyncHandler(approveRun));
router.post('/agent-runs/:runId/reject', asyncHandler(rejectRun));

export default router;
