import { Router } from 'express';
import healthRoutes from './system/health.js';
import authRoutes from './auth/authRoutes.js';
import resetPasswordRoutes from './auth/resetPasswordRoutes.js';
import onboardingRoutes from './auth/onboardingRoutes.js';
import googleConnectionRoutes from './connection/googleConnection.js';
import workflowRoutes from './builder/workflowRoutes.js';
import formRoutes from './forms/formRoutes.js';
import logRoutes from './builder/logRoutes.js';
import dashboardRoutes from './dashboard/dashboardRoutes.js';
import chatRoutes from './chat/chatRoutes.js';
import storageRoutes from './storage/storageRoutes.js';
import nodeRoutes from './builder/nodeRoutes.js';
import webhookRoutes from './system/webhookRoutes.js';
import providerEventRoutes from './system/providerEventRoutes.js';
import rateLimit from 'express-rate-limit';

const router = Router();

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 50,
    message: 'Too many authentication attempts, please try again after 15 minutes'
});

router.use('/health', healthRoutes);
router.use('/auth', authLimiter, authRoutes);
router.use('/storage', storageRoutes);
router.use('/auth', authLimiter, resetPasswordRoutes);
router.use('/onboarding', onboardingRoutes);
router.use('/auth/google', authLimiter, googleConnectionRoutes);
router.use('/automations', workflowRoutes);
router.use('/forms', formRoutes);
router.use('/runs', logRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/conversations', chatRoutes);
router.use('/nodes', nodeRoutes);
router.use('/webhooks', webhookRoutes);
router.use('/provider-events', providerEventRoutes);

export default router;
