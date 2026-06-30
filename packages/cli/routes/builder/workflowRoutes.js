import { Router } from 'express';
import asyncHandler from '../../utils/asyncHandler.js';
import { requireAuth } from '../../middleware/authMiddleware.js';
import { 
    getWorkflows, createWorkflow, updateWorkflow, deleteWorkflow, triggerWorkflow 
} from '../../controllers/builder/workflowController.js';

const router = Router();

router.use(requireAuth);

router.get('/', asyncHandler(getWorkflows));
router.post('/', asyncHandler(createWorkflow));
router.put('/:id', asyncHandler(updateWorkflow));
router.delete('/:id', asyncHandler(deleteWorkflow));
router.post('/:id/trigger', asyncHandler(triggerWorkflow));

export default router;
