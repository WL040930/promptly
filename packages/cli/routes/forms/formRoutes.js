import { Router } from 'express';
import express from 'express';
import { requireAuth } from '../../middleware/authMiddleware.js';
import { 
    getForms, getForm, createForm, updateForm, deleteForm, submitFormResponse, getFormResponses, getPublicForm,
    getFormChatHistory, submitFormAITurn, decideFormProposal, clearFormAIChat, resetFormAIContext, previewFormChange,
    uploadPublicFormFile, discardPublicFormFile
} from '../../controllers/forms/formController.js';

const router = Router();

// Public routes
router.get('/public/:id', getPublicForm);
router.post('/public/:formId/files', express.raw({ type: '*/*', limit: '50mb' }), uploadPublicFormFile);
router.delete('/public/:formId/files/:assetId', discardPublicFormFile);
router.post('/:formId/responses', submitFormResponse);

// Protected routes
router.use(requireAuth);

router.get('/', getForms);
router.post('/', createForm);
router.get('/:id', getForm);
router.post('/:id/change-preview', previewFormChange);
router.post('/:formId/ai-turns', submitFormAITurn);
router.delete('/:formId/chat', clearFormAIChat);
router.delete('/:formId/ai-context', resetFormAIContext);
router.put('/:id', updateForm);
router.delete('/:id', deleteForm);
router.get('/:formId/responses', getFormResponses);
router.post('/:formId/ai-proposals/:messageId/decide', decideFormProposal);

// Chat History routes
router.get('/:formId/chat', getFormChatHistory);

export default router;
