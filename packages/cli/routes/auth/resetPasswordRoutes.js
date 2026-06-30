import { Router } from 'express';
import asyncHandler from '../../utils/asyncHandler.js';
import { forgotPassword, resetPassword } from '../../controllers/auth/authController.js';

const router = Router();

router.post('/forgot-password', asyncHandler(forgotPassword));
router.post('/reset-password/:token', asyncHandler(resetPassword));

export default router;
