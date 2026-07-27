import { Router } from 'express';
import asyncHandler from '../../utils/asyncHandler.js';
import { requireAuth } from '../../middleware/authMiddleware.js';
import { 
    getWorkflows, getWorkflow, createWorkflow, updateWorkflow, deleteWorkflow, triggerWorkflow, triggerProductionWorkflow,
    getWorkflowVersions, saveWorkflowVersion, restoreWorkflowVersion, publishWorkflow, pauseWorkflow
} from '../../controllers/builder/workflowController.js';
import { getWorkflowAIChat, clearWorkflowAIChat, resetWorkflowAIContext, submitWorkflowAITurn, decideWorkflowAIProposal } from '../../controllers/builder/workflowAIController.js';

const router = Router();

router.use(requireAuth);

router.get('/', asyncHandler(getWorkflows));
router.get('/:id', asyncHandler(getWorkflow));
router.post('/', asyncHandler(createWorkflow));
router.put('/:id', asyncHandler(updateWorkflow));
router.delete('/:id', asyncHandler(deleteWorkflow));
router.post('/:id/test', asyncHandler(triggerWorkflow));
router.post('/:id/run', asyncHandler(triggerProductionWorkflow));
router.post('/:id/publish', asyncHandler(publishWorkflow));
router.post('/:id/pause', asyncHandler(pauseWorkflow));
router.get('/:id/ai-chat', getWorkflowAIChat);
router.delete('/:id/ai-chat', clearWorkflowAIChat);
router.delete('/:id/ai-context', resetWorkflowAIContext);
router.post('/:id/ai-turns', submitWorkflowAITurn);
router.post('/:id/ai-proposals/:messageId/decision', decideWorkflowAIProposal);

// Versioning routes
router.get('/:id/versions', asyncHandler(getWorkflowVersions));
router.post('/:id/versions', asyncHandler(saveWorkflowVersion));
router.post('/:id/versions/:versionId/restore', asyncHandler(restoreWorkflowVersion));

export default router;
