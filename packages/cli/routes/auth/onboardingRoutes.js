import { Router } from 'express';
import asyncHandler from '../../utils/asyncHandler.js';
import { completeOnboarding, startOnboarding, skipOnboarding } from '../../controllers/auth/authController.js';
import { requireAuth } from '../../middleware/authMiddleware.js';
import OnboardingProgress from '../../models/core/OnboardingProgress.js';

const router = Router();

router.use(requireAuth);
router.get('/', asyncHandler(async (req, res) => res.json({ onboarding: await OnboardingProgress.findOne({ where: { userId: req.user.id } }) })));
router.post('/start', asyncHandler(startOnboarding));
router.post('/complete', asyncHandler(completeOnboarding));
router.post('/skip', asyncHandler(skipOnboarding));

export default router;
