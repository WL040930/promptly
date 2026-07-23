import sequelize from '../../db/index.js';
import { AssistantMessage, AssistantThread, Form, FormResponse, Workflow } from '../../models/index.js';
import { validateQuestionCardinality } from '../../services/ai/form/context/formContext.js';
import { applyFormPatches } from '../../services/ai/form/domain/formPatchEngine.js';
import { validateFormSchema } from '../../services/ai/form/domain/formSchemaValidator.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { executeWorkflow } from '../../services/engine/executionEngine.js';
import { formAssistant } from '../../services/ai/form/formAssistant.js';

export const getForms = asyncHandler(async (req, res) => {
    const forms = await Form.findAll({ where: { userId: req.user.id } });
    res.json(forms);
});

export const createForm = asyncHandler(async (req, res) => {
    const { title, description, settings, fields } = req.body;
    const validationIssues = validateFormSchema({ title, description: description || '', settings: settings || {}, fields: fields || [] });
    if (validationIssues.length > 0) {
        return res.status(400).json({ error: 'Invalid form schema.', issues: validationIssues });
    }
    const form = await Form.create({ title, description, settings, fields, userId: req.user.id });
    res.status(201).json(form);
});

// One server-owned turn: persist the user input, run the AI, persist the
// assistant result, and update the form conversation state as one lifecycle.
export const submitFormAITurn = asyncHandler(async (req, res) => {
    const { formId } = req.params;
    const { command, text, clarificationMode, requestId, expectedStateVersion } = req.body || {};
    const useSSE = req.headers.accept === 'text/event-stream';

    if (useSSE) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
    }

    const onProgress = data => {
        if (useSSE) res.write(`data: ${JSON.stringify({ type: 'progress', ...data })}\n\n`);
    };
    const result = await formAssistant.submitTurn({
        userId: req.user.id,
        formId,
        command,
        text,
        clarificationMode,
        expectedStateVersion,
        requestId,
        onProgress
    });

    if (useSSE) {
        res.write(`data: ${JSON.stringify({ type: 'complete', result })}\n\n`);
        return res.end();
    }
    res.status(201).json(result);
});

export const clearFormAIChat = asyncHandler(async (req, res) => {
    const result = await formAssistant.clearChat({ userId: req.user.id, formId: req.params.formId });
    res.json(result);
});

export const decideFormProposal = asyncHandler(async (req, res) => {
    const { formId, messageId } = req.params;
    const { action = 'accept', selectedPatchIds, baseFormUpdatedAt } = req.body || {};
    try {
        const result = await formAssistant.decideProposal({
            userId: req.user.id,
            formId,
            proposalMessageId: messageId,
            action,
            selectedPatchIds,
            baseFormUpdatedAt
        });
        res.json(result);
    } catch (error) {
        if (error.code === 'FORM_PROPOSAL_STALE') {
            return res.status(409).json({ code: error.code, message: error.message });
        }
        if (error.code === 'FORM_PROPOSAL_CARDINALITY_MISMATCH') {
            return res.status(400).json({ code: error.code, message: error.message, issues: error.issues || [] });
        }
        if (error.code === 'FORM_PROPOSAL_NOT_PENDING') {
            return res.status(409).json({ code: error.code, message: error.message });
        }
        throw error;
    }
});

export const updateForm = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { title, description, settings, fields, baseFormUpdatedAt } = req.body;
    
    const form = await Form.findOne({ where: { id, userId: req.user.id } });
    if (!form) return res.status(404).json({ message: 'Form not found' });

    if (baseFormUpdatedAt && new Date(form.updatedAt).getTime() !== new Date(baseFormUpdatedAt).getTime()) {
        return res.status(409).json({ code: 'FORM_PROPOSAL_STALE', message: 'This proposal was created from an older form version. Generate a new suggestion.' });
    }
    
    const nextSchema = {
        ...form.toJSON(),
        title: title ?? form.title,
        description: description ?? form.description ?? '',
        settings: settings ?? form.settings ?? {},
        fields: fields ?? form.fields ?? []
    };
    const validationIssues = validateFormSchema(nextSchema);
    if (validationIssues.length > 0) {
        return res.status(400).json({ error: 'Invalid form schema.', issues: validationIssues });
    }

    await form.update({
        title: nextSchema.title,
        description: nextSchema.description,
        settings: nextSchema.settings,
        fields: nextSchema.fields
    });
    res.json(form);
});

export const deleteForm = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const form = await Form.findOne({ where: { id, userId: req.user.id } });
    if (!form) return res.status(404).json({ message: 'Form not found' });

    await sequelize.transaction(async (transaction) => {
        await AssistantThread.destroy({
            where: { surface: 'form', formId: form.id },
            transaction
        });

        await FormResponse.destroy({
            where: { formId: form.id },
            transaction
        });

        await form.destroy({ transaction });
    });

    res.json({ message: 'Form deleted' });
});

// Public Form view
export const getPublicForm = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const form = await Form.findByPk(id, {
        attributes: ['id', 'title', 'description', 'settings', 'fields', 'responseCount']
    });
    if (!form) return res.status(404).json({ message: 'Form not found' });

    // If there is a limit, check if it's reached. If so, override acceptingResponses for the client.
    if (form.settings && form.settings.hasResponseLimit && form.settings.responseLimit) {
        if (form.responseCount >= parseInt(form.settings.responseLimit, 10)) {
            const updatedSettings = { ...form.settings, acceptingResponses: false };
            form.settings = updatedSettings;
        }
    }

    res.json(form);
});

// Form Responses
export const submitFormResponse = asyncHandler(async (req, res) => {
    const { formId } = req.params;
    const { responseData } = req.body;
    
    // We don't check for req.user here because responses are likely anonymous/public
    const form = await Form.findByPk(formId);
    if (!form) return res.status(404).json({ message: 'Form not found' });

    // Check acceptingResponses
    if (form.settings && form.settings.acceptingResponses === false) {
        return res.status(400).json({ message: 'This form is no longer accepting responses' });
    }

    if (form.settings && form.settings.hasResponseLimit && form.settings.responseLimit) {
        if (form.responseCount >= parseInt(form.settings.responseLimit, 10)) {
            return res.status(400).json({ message: 'This form has reached its response limit' });
        }
    }

    // Save a snapshot of the current fields to prevent schema drift issues
    const snapshot = form.fields;

    const response = await FormResponse.create({ formId, responseData, snapshot });
    
    // Increment the denormalized response count
    await form.increment('responseCount');

    // ── Fire-and-forget: dispatch any workflows bound to this form ──────────
    const initialPayload = {
        fields:      responseData,
        responseId:  response.id,
        submittedAt: response.createdAt,
    };
    // Find all active workflows for this form's owner
    Workflow.findAll({ where: { userId: form.userId, isActive: true } })
        .then(workflows => {
            for (const workflow of workflows) {
                const triggerNode = (workflow.nodes || []).find(
                    n => n.subType === 'form-submission' && n.config?.formId === formId
                );
                if (triggerNode) {
                    executeWorkflow(workflow.id, form.userId, initialPayload, { runType: 'production', trigger: 'form-submission' })
                        .catch(err => console.error(`[FormTrigger] Dispatch failed for workflow ${workflow.id}:`, err.message));
                }
            }
        })
        .catch(err => console.error('[FormTrigger] Failed to load workflows for dispatch:', err.message));
    // ────────────────────────────────────────────────────────────────────────
    
    res.status(201).json(response);
});

export const getFormResponses = asyncHandler(async (req, res) => {
    const { formId } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    // Check form belongs to user
    const form = await Form.findOne({ where: { id: formId, userId: req.user.id } });
    if (!form) return res.status(404).json({ message: 'Form not found' });

    const responses = await FormResponse.findAll({ 
        where: { formId },
        order: [['createdAt', 'DESC']],
        limit: parseInt(limit, 10),
        offset: parseInt(offset, 10)
    });
    res.json(responses);
});

// Form Chat History
export const getFormChatHistory = asyncHandler(async (req, res) => {
    const { formId } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    const form = await Form.findOne({ where: { id: formId, userId: req.user.id } });
    if (!form) return res.status(404).json({ message: 'Form not found' });

    const thread = await AssistantThread.findOne({ where: { surface: 'form', formId, userId: req.user.id } });
    if (!thread) return res.json([]);
    const messages = await AssistantMessage.findAll({
        where: { threadId: thread.id },
        order: [['createdAt', 'DESC']],
        limit: parseInt(limit, 10),
        offset: parseInt(offset, 10)
    });

    // Return messages in chronological order for the frontend
    res.json(messages.reverse().map(message => ({ ...message.toJSON(), formId })));
});

export const updateFormChatMessage = asyncHandler(async (req, res) => {
    const { messageId } = req.params;
    const { proposal } = req.body;

    const message = await AssistantMessage.findByPk(messageId);
    const thread = message
        ? await AssistantThread.findOne({ where: { id: message.threadId, surface: 'form', userId: req.user.id } })
        : null;

    if (!message || !thread) return res.status(404).json({ message: 'Message not found' });

    await message.update({ payload: proposal, proposalStatus: proposal?.status || message.proposalStatus });
    let stateVersion = null;
    if (['rejected', 'stale', 'superseded', 'accepted'].includes(proposal?.status)) {
        const state = thread.state || {};
        if (state.activeProposalMessageId === message.id) {
            const nextState = {
                ...state,
                phase: 'idle',
                activeProposalMessageId: null,
                openClarification: null,
                activeWork: null,
                version: Number(state.version || 1) + 1
            };
            await thread.update({ state: nextState });
            stateVersion = nextState.version;
        }
    }
    res.json({ ...message.toJSON(), stateVersion });
});
