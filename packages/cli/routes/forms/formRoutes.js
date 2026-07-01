import { Router } from 'express';
import asyncHandler from '../../utils/asyncHandler.js';
import { requireAuth } from '../../middleware/authMiddleware.js';
import { 
    getForms, createForm, updateForm, deleteForm, submitFormResponse, getFormResponses, getPublicForm, generateForm,
    getFormChatHistory, addFormChatMessage, updateFormChatMessage
} from '../../controllers/forms/formController.js';

const router = Router();

// Public routes
router.get('/public/:id', asyncHandler(getPublicForm));
router.post('/:formId/responses', asyncHandler(submitFormResponse));

// Protected routes
router.use(requireAuth);

router.get('/', asyncHandler(getForms));
router.post('/', asyncHandler(createForm));
router.post('/generate', asyncHandler(generateForm));
router.put('/:id', asyncHandler(updateForm));
router.delete('/:id', asyncHandler(deleteForm));
router.get('/:formId/responses', asyncHandler(getFormResponses));

// Chat History routes
router.get('/:formId/chat', asyncHandler(getFormChatHistory));
router.post('/:formId/chat', asyncHandler(addFormChatMessage));
router.put('/chat/:messageId', asyncHandler(updateFormChatMessage));

export default router;
