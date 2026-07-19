import sequelize from '../../db/index.js';
import { Form, FormResponse, FormChatMessage, FormAIState, Workflow } from '../../models/index.js';
import { runFormTurn } from '../../services/ai/formAIService.js';
import { FORM_AI_HISTORY_LIMIT, validateQuestionCardinality } from '../../services/ai/form/context/formContext.js';
import { applyFormPatches } from '../../services/ai/form/domain/formPatchEngine.js';
import { validateFormSchema } from '../../services/ai/form/domain/formSchemaValidator.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { executeWorkflow } from '../../services/engine/executionEngine.js';
import { supersedePendingFormChatProposals } from '../../services/proposalLifecycle.js';
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

export const generateForm = asyncHandler(async (req, res) => {
    const { prompt, currentSchema, formId, clarificationMode } = req.body;
    if (!prompt) {
        return res.status(400).json({ message: 'Prompt is required' });
    }
    
    let formSchema = currentSchema;
    let chatHistory = [];
    let sourceForm = null;
    if (formId) {
        sourceForm = await Form.findOne({ where: { id: formId, userId: req.user.id } });
        if (!sourceForm) return res.status(404).json({ message: 'Form not found' });

        formSchema = sourceForm.toJSON();
        const rawHistory = await FormChatMessage.findAll({
            where: { formId },
            order: [['createdAt', 'DESC']],
            limit: FORM_AI_HISTORY_LIMIT
        });
        // Reverse so they are in chronological order for the AI
        chatHistory = rawHistory.reverse();
    }

    const useSSE = req.headers.accept === 'text/event-stream';
    
    if (useSSE) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        
        const onProgress = (data) => {
            res.write(`data: ${JSON.stringify({ type: 'progress', ...data })}\n\n`);
        };
        
        try {
            const generatedForm = await runFormTurn({
                request: prompt,
                currentSchema: formSchema,
                history: chatHistory,
                onProgress,
                clarificationMode
            });
            if (sourceForm && generatedForm) generatedForm.baseFormUpdatedAt = sourceForm.updatedAt;
            res.write(`data: ${JSON.stringify({ type: 'complete', result: generatedForm })}\n\n`);
            res.end();
        } catch (error) {
            console.error('Error generating form:', error);
            res.write(`data: ${JSON.stringify({ type: 'error', code: error.code, message: error.message, issues: error.issues })}\n\n`);
            res.end();
        }
    } else {
        const generatedForm = await runFormTurn({
            request: prompt,
            currentSchema: formSchema,
            history: chatHistory,
            clarificationMode
        });
        if (sourceForm && generatedForm) generatedForm.baseFormUpdatedAt = sourceForm.updatedAt;
        res.json(generatedForm);
    }
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

export const acceptFormProposal = asyncHandler(async (req, res) => {
    const { formId, messageId } = req.params;
    const { selectedPatchIds, baseFormUpdatedAt } = req.body || {};

    const form = await Form.findOne({ where: { id: formId, userId: req.user.id } });
    if (!form) return res.status(404).json({ message: 'Form not found' });

    const message = await FormChatMessage.findOne({ where: { id: messageId, formId } });
    if (!message) return res.status(404).json({ message: 'Proposal message not found' });
    if (message.sender !== 'bot' || message.proposal?.status !== 'pending') {
        return res.status(409).json({ message: 'This proposal is no longer pending.' });
    }

    const proposal = message.proposal || {};
    const proposalPatches = Array.isArray(proposal.patches) ? proposal.patches : [];
    const patchesWithIds = proposalPatches.map((patch, index) => ({
        ...patch,
        patchId: patch.patchId || `patch_${index + 1}`
    }));
    const requestedPatchIds = selectedPatchIds === undefined ? patchesWithIds.map(patch => patch.patchId) : selectedPatchIds;
    if (!Array.isArray(requestedPatchIds)) return res.status(400).json({ message: 'selectedPatchIds must be an array.' });

    const patchIds = new Set(patchesWithIds.map(patch => patch.patchId));
    if (requestedPatchIds.some(patchId => !patchIds.has(patchId))) {
        return res.status(400).json({ message: 'The proposal contains an unknown patch selection.' });
    }

    const expectedRevision = baseFormUpdatedAt || proposal.baseFormUpdatedAt;
    if (expectedRevision && new Date(form.updatedAt).getTime() !== new Date(expectedRevision).getTime()) {
        await message.update({
            proposal: {
                ...proposal,
                status: 'stale',
                staleReason: 'FORM_VERSION_CHANGED'
            }
        });
        const state = await FormAIState.findOne({ where: { formId } });
        if (state?.activeProposalMessageId === message.id) {
            await state.update({
                phase: 'idle',
                activeProposalMessageId: null,
                openClarification: null,
                activeWork: null,
                version: state.version + 1
            });
        }
        return res.status(409).json({ code: 'FORM_PROPOSAL_STALE', message: 'This proposal was created from an older form version. Generate a new suggestion.' });
    }

    const selectedPatches = patchesWithIds.filter(patch => requestedPatchIds.includes(patch.patchId));
    let applied;
    try {
        applied = applyFormPatches({ currentSchema: form.toJSON(), patches: selectedPatches });
    } catch (error) {
        return res.status(400).json({ code: 'FORM_PROPOSAL_INVALID', message: 'This proposal can no longer be safely applied.', issues: error.issues || [] });
    }

    const cardinality = proposal.cardinality;
    const cardinalityIssue = validateQuestionCardinality({ schema: applied.schema, cardinality });
    if (cardinalityIssue) {
        return res.status(400).json({
            code: 'FORM_PROPOSAL_CARDINALITY_MISMATCH',
            message: 'The selected changes no longer satisfy the requested question count. Select the complete set of question changes or generate a new proposal.',
            issues: [cardinalityIssue]
        });
    }

    await sequelize.transaction(async (transaction) => {
        await form.update({
            title: applied.schema.title,
            description: applied.schema.description,
            settings: applied.schema.settings,
            fields: applied.schema.fields
        }, { transaction });

        const state = await FormAIState.findOne({ where: { formId }, transaction });
        if (state) {
            await state.update({
                phase: 'idle',
                activeProposalMessageId: null,
                openClarification: null,
                activeWork: null,
                version: state.version + 1
            }, { transaction });
        }

        await message.update({
            proposal: {
                ...proposal,
                schema: applied.schema,
                patches: applied.patches,
                selectedPatchIds: requestedPatchIds,
                status: 'accepted'
            }
        }, { transaction });
    });

    res.json({ form, proposal: message.proposal });
});

export const deleteForm = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const form = await Form.findOne({ where: { id, userId: req.user.id } });
    if (!form) return res.status(404).json({ message: 'Form not found' });

    await sequelize.transaction(async (transaction) => {
        await FormChatMessage.destroy({
            where: { formId: form.id },
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

    const messages = await FormChatMessage.findAll({
        where: { formId },
        order: [['createdAt', 'DESC']],
        limit: parseInt(limit, 10),
        offset: parseInt(offset, 10)
    });

    // Return messages in chronological order for the frontend
    res.json(messages.reverse());
});

const sanitizeFormErrorMetadata = (metadata) => {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;

    const sanitized = {};
    if (typeof metadata.code === 'string') sanitized.code = metadata.code.slice(0, 100);
    if (typeof metadata.retryable === 'boolean') sanitized.retryable = metadata.retryable;
    if (typeof metadata.stage === 'string') sanitized.stage = metadata.stage.slice(0, 100);
    if (Number.isInteger(metadata.retryAfterSeconds) && metadata.retryAfterSeconds > 0) {
        sanitized.retryAfterSeconds = metadata.retryAfterSeconds;
    }

    return Object.keys(sanitized).length > 0 ? sanitized : null;
};

export const addFormChatMessage = asyncHandler(async (req, res) => {
    const { formId } = req.params;
    const { sender, text, proposal, options, tokenUsage, isError, errorMetadata } = req.body;

    const form = await Form.findOne({ where: { id: formId, userId: req.user.id } });
    if (!form) return res.status(404).json({ message: 'Form not found' });

    let message;
    let supersededMessageIds = [];
    await sequelize.transaction(async transaction => {
        if (sender === 'bot' && proposal?.status === 'pending') {
            supersededMessageIds = await supersedePendingFormChatProposals({ formId, transaction });
        }
        message = await FormChatMessage.create({
            formId,
            sender,
            text,
            proposal,
            options,
            tokenUsage,
            isError,
            errorMetadata: isError ? sanitizeFormErrorMetadata(errorMetadata) : null
        }, { transaction });
    });

    res.status(201).json({ ...message.toJSON(), supersededMessageIds });
});

export const updateFormChatMessage = asyncHandler(async (req, res) => {
    const { messageId } = req.params;
    const { proposal } = req.body;

    const message = await FormChatMessage.findOne({
        where: { id: messageId },
        include: [{
            model: Form,
            as: 'form',
            where: { userId: req.user.id }
        }]
    });

    if (!message) return res.status(404).json({ message: 'Message not found' });

    await message.update({ proposal });
    let stateVersion = null;
    if (['rejected', 'stale', 'superseded', 'accepted'].includes(proposal?.status)) {
        const formId = message.formId;
        const state = await FormAIState.findOne({ where: { formId } });
        if (state?.activeProposalMessageId === message.id) {
            await state.update({
                phase: 'idle',
                activeProposalMessageId: null,
                openClarification: null,
                activeWork: null,
                version: state.version + 1
            });
            stateVersion = state.version;
        }
    }
    res.json({ ...message.toJSON(), stateVersion });
});
