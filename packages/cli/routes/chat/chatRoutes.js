import { Router } from 'express';
import asyncHandler from '../../utils/asyncHandler.js';
import { requireAuth } from '../../middleware/authMiddleware.js';
import { sendMessage, getSession, getSessions, updateSession, deleteSession } from '../../controllers/chat/chatController.js';

const router = Router();

router.use(requireAuth);
router.post('/message', asyncHandler(sendMessage));
router.get('/sessions', asyncHandler(getSessions));
router.get('/session/:sessionId', asyncHandler(getSession));
router.put('/session/:sessionId', asyncHandler(updateSession));
router.delete('/session/:sessionId', asyncHandler(deleteSession));

export default router;
