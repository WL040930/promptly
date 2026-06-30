import { Router } from 'express';
import healthRoutes from './health.js';
import promptsRoutes from './prompts.js';
import authRoutes from './auth/authRoutes.js';
import resetPasswordRoutes from './auth/resetPasswordRoutes.js';
import googleConnectionRoutes from './connection/googleConnection.js';
import workflowRoutes from './workflowRoutes.js';
import folderRoutes from './folderRoutes.js';
import formRoutes from './formRoutes.js';
import logRoutes from './logRoutes.js';
import dashboardRoutes from './dashboardRoutes.js';
import chatRoutes from './chatRoutes.js';
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
router.use('/workflows', workflowRoutes);
router.use('/folders', folderRoutes);
router.use('/forms', formRoutes);
router.use('/logs', logRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/chat', chatRoutes);

export default router;
