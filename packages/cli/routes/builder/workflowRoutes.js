import { Router } from 'express';
import asyncHandler from '../../utils/asyncHandler.js';
import { requireAuth } from '../../middleware/authMiddleware.js';
import { 
    getWorkflows, getWorkflow, createWorkflow, updateWorkflow, deleteWorkflow, triggerWorkflow,
    getWorkflowVersions, saveWorkflowVersion, restoreWorkflowVersion, publishWorkflow, pauseWorkflow
} from '../../controllers/builder/workflowController.js';

const router = Router();

router.use(requireAuth);

router.get('/', asyncHandler(getWorkflows));
router.get('/:id', asyncHandler(getWorkflow));
router.post('/', asyncHandler(createWorkflow));
router.put('/:id', asyncHandler(updateWorkflow));
router.delete('/:id', asyncHandler(deleteWorkflow));
router.post('/:id/test', asyncHandler(triggerWorkflow));
router.post('/:id/publish', asyncHandler(publishWorkflow));
router.post('/:id/pause', asyncHandler(pauseWorkflow));

// Versioning routes
router.get('/:id/versions', asyncHandler(getWorkflowVersions));
router.post('/:id/versions', asyncHandler(saveWorkflowVersion));
router.post('/:id/versions/:versionId/restore', asyncHandler(restoreWorkflowVersion));

export default router;
