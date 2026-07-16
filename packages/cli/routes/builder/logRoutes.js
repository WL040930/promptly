import { Router } from 'express';
import asyncHandler from '../../utils/asyncHandler.js';
import { requireAuth } from '../../middleware/authMiddleware.js';
import { getExecutionLog, getExecutionLogs } from '../../controllers/builder/logController.js';

const router = Router();

router.use(requireAuth);
router.get('/', asyncHandler(getExecutionLogs));
router.get('/:id', asyncHandler(getExecutionLog));

export default router;
