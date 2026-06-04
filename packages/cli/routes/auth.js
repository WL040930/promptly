import { Router } from 'express';
import asyncHandler from '../utils/asyncHandler.js';
import { login, register, updateExperienceLevel, getMe } from '../controllers/authController.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = Router();

router.post('/register', asyncHandler(register));
router.post('/login', asyncHandler(login));
router.get('/me', requireAuth, asyncHandler(getMe));
router.put('/onboarding', requireAuth, asyncHandler(updateExperienceLevel));
router.put('/experience-level', requireAuth, asyncHandler(updateExperienceLevel));

export default router;
