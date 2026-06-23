import { Router } from 'express';
import asyncHandler from '../../utils/asyncHandler.js';
import { googleConnect, googleCallback, googleDisconnect } from '../../controllers/connection/googleController.js';
import { requireAuth } from '../../middleware/authMiddleware.js';

const router = Router();

router.get('/connect', requireAuth, asyncHandler(googleConnect));
router.get('/callback', asyncHandler(googleCallback));
router.post('/disconnect', requireAuth, asyncHandler(googleDisconnect));

export default router;
