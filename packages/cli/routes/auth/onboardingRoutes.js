import { Router } from 'express';
import asyncHandler from '../../utils/asyncHandler.js';
import { completeOnboarding } from '../../controllers/auth/authController.js';
import { requireAuth } from '../../middleware/authMiddleware.js';

const router = Router();

router.use(requireAuth);
router.post('/complete', asyncHandler(completeOnboarding));

export default router;
