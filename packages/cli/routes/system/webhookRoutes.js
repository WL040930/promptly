import { Router } from 'express';
import asyncHandler from '../../utils/asyncHandler.js';
import { handleWebhook } from '../../controllers/system/webhookController.js';

const router = Router();

// Public — no auth required
router.post('/:webhookId', asyncHandler(handleWebhook));

export default router;
