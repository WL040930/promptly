import { Router } from 'express';
import { requireAuth } from '../../middleware/authMiddleware.js';
import { 
    getForms, createForm, updateForm, deleteForm, submitFormResponse, getFormResponses, getPublicForm,
    getFormChatHistory, updateFormChatMessage, submitFormAITurn, decideFormProposal, clearFormAIChat
} from '../../controllers/forms/formController.js';

const router = Router();

// Public routes
router.get('/public/:id', getPublicForm);
router.post('/:formId/responses', submitFormResponse);

// Protected routes
router.use(requireAuth);

router.get('/', getForms);
router.post('/', createForm);
router.post('/:formId/ai-turns', submitFormAITurn);
router.delete('/:formId/chat', clearFormAIChat);
router.put('/:id', updateForm);
router.delete('/:id', deleteForm);
router.get('/:formId/responses', getFormResponses);
router.post('/:formId/ai-proposals/:messageId/accept', decideFormProposal);

// Chat History routes
router.get('/:formId/chat', getFormChatHistory);
router.put('/chat/:messageId', updateFormChatMessage);

export default router;
