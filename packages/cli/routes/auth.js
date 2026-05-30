import { Router } from 'express';
import asyncHandler from '../utils/asyncHandler.js';
import { login, register, updateOnboarding } from '../controllers/authController.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = Router();

router.post('/register', asyncHandler(register));
router.post('/login', asyncHandler(login));
router.put('/onboarding', requireAuth, asyncHandler(updateOnboarding));

export default router;
