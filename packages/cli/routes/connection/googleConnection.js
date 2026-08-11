import { Router } from 'express';
import asyncHandler from '../../utils/asyncHandler.js';
import { googleConnect, googleCallback, googleDisconnect, getGoogleConnectionStatus } from '../../controllers/connection/googleController.js';
import { requireAuth } from '../../middleware/authMiddleware.js';

const router = Router();

router.get('/connect', requireAuth, asyncHandler(googleConnect));
router.get('/status', requireAuth, asyncHandler(getGoogleConnectionStatus));
router.get('/callback', asyncHandler(googleCallback));
router.post('/disconnect', requireAuth, asyncHandler(googleDisconnect));

export default router;
