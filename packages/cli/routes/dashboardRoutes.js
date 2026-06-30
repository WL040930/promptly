import { Router } from 'express';
import asyncHandler from '../utils/asyncHandler.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import { getDashboardMetrics } from '../controllers/dashboardController.js';

const router = Router();

router.use(requireAuth);
router.get('/metrics', asyncHandler(getDashboardMetrics));

export default router;
