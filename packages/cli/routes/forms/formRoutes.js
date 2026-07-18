import { Router } from 'express';
import { requireAuth } from '../../middleware/authMiddleware.js';
import { 
    getForms, createForm, updateForm, deleteForm, submitFormResponse, getFormResponses, getPublicForm, generateForm,
    getFormChatHistory, addFormChatMessage, updateFormChatMessage, acceptFormProposal
} from '../../controllers/forms/formController.js';

const router = Router();

// Public routes
router.get('/public/:id', getPublicForm);
router.post('/:formId/responses', submitFormResponse);

// Protected routes
router.use(requireAuth);

router.get('/', getForms);
router.post('/', createForm);
router.post('/generate', generateForm);
router.put('/:id', updateForm);
router.delete('/:id', deleteForm);
router.get('/:formId/responses', getFormResponses);
router.post('/:formId/ai-proposals/:messageId/accept', acceptFormProposal);

// Chat History routes
router.get('/:formId/chat', getFormChatHistory);
router.post('/:formId/chat', addFormChatMessage);
router.put('/chat/:messageId', updateFormChatMessage);

export default router;
