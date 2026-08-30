import { Router } from 'express';
import asyncHandler from '../../utils/asyncHandler.js';
import { completeOnboarding } from '../../controllers/auth/authController.js';
import {
    deleteOnboardingDemo,
    ensureOnboardingDemo,
    getOnboardingContext,
    resetOnboardingDemo
} from '../../controllers/auth/onboardingController.js';
import { requireAuth } from '../../middleware/authMiddleware.js';

const router = Router();

router.use(requireAuth);
router.get('/context', asyncHandler(getOnboardingContext));
router.post('/demo/ensure', asyncHandler(ensureOnboardingDemo));
router.post('/demo/reset', asyncHandler(resetOnboardingDemo));
router.delete('/demo', asyncHandler(deleteOnboardingDemo));
router.post('/complete', asyncHandler(completeOnboarding));

export default router;
