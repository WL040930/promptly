import { Router } from 'express';
import asyncHandler from '../../utils/asyncHandler.js';
import { requireAuth } from '../../middleware/authMiddleware.js';
import { 
    getWorkflows, createWorkflow, updateWorkflow, deleteWorkflow, triggerWorkflow,
    getWorkflowVersions, saveWorkflowVersion, restoreWorkflowVersion
} from '../../controllers/builder/workflowController.js';

const router = Router();

router.use(requireAuth);

router.get('/', asyncHandler(getWorkflows));
router.post('/', asyncHandler(createWorkflow));
router.put('/:id', asyncHandler(updateWorkflow));
router.delete('/:id', asyncHandler(deleteWorkflow));
router.post('/:id/trigger', asyncHandler(triggerWorkflow));

// Versioning routes
router.get('/:id/versions', asyncHandler(getWorkflowVersions));
router.post('/:id/versions', asyncHandler(saveWorkflowVersion));
router.post('/:id/versions/:versionId/restore', asyncHandler(restoreWorkflowVersion));

export default router;
