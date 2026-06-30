import { Router } from 'express';
import asyncHandler from '../utils/asyncHandler.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import { 
    getForms, createForm, updateForm, deleteForm, submitFormResponse, getFormResponses 
} from '../controllers/formController.js';

const router = Router();

// Public route for submitting form responses
router.post('/:formId/responses', asyncHandler(submitFormResponse));

// Protected routes
router.use(requireAuth);

router.get('/', asyncHandler(getForms));
router.post('/', asyncHandler(createForm));
router.put('/:id', asyncHandler(updateForm));
router.delete('/:id', asyncHandler(deleteForm));
router.get('/:formId/responses', asyncHandler(getFormResponses));

export default router;
