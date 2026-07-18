import { Router } from 'express';
import asyncHandler from '../../utils/asyncHandler.js';
import { login, register, getMe, changePassword } from '../../controllers/auth/authController.js';
import { requireAuth } from '../../middleware/authMiddleware.js';

const router = Router();

router.post('/register', asyncHandler(register));
router.post('/login', asyncHandler(login));
router.get('/me', requireAuth, asyncHandler(getMe));
router.put('/change-password', requireAuth, asyncHandler(changePassword));

export default router;
