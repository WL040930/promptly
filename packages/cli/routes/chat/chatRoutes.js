import { Router } from 'express';
import asyncHandler from '../../utils/asyncHandler.js';
import { requireAuth } from '../../middleware/authMiddleware.js';
import { sendMessage, getSession, getSessions } from '../../controllers/chat/chatController.js';

const router = Router();

router.use(requireAuth);
router.post('/message', asyncHandler(sendMessage));
router.get('/sessions', asyncHandler(getSessions));
router.get('/session/:sessionId', asyncHandler(getSession));

export default router;
