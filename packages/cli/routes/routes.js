import { Router } from 'express';
import healthRoutes from './health.js';
import promptsRoutes from './prompts.js';
import authRoutes from './auth/authRoutes.js';
import resetPasswordRoutes from './auth/resetPasswordRoutes.js';
import googleConnectionRoutes from './connection/googleConnection.js';
import rateLimit from 'express-rate-limit';

const router = Router();

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 50,
    message: 'Too many authentication attempts, please try again after 15 minutes'
});

router.use('/health', healthRoutes);
router.use('/prompts', promptsRoutes);
router.use('/auth', authLimiter, authRoutes);
router.use('/auth', authLimiter, resetPasswordRoutes);
router.use('/auth/google', authLimiter, googleConnectionRoutes);

export default router;
