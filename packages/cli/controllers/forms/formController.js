import sequelize from '../../db/index.js';
import { AssistantThread, Form, FormResponse, WorkflowTriggerBinding } from '../../models/index.js';
import { validateFormSchema } from '../../services/ai/form/domain/formSchemaValidator.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { executeWorkflow } from '../../services/engine/executionEngine.js';
import { formAssistant } from '../../services/ai/form/formAssistant.js';

export const getForms = asyncHandler(async (req, res) => {
    const forms = await Form.findAll({
        where: { userId: req.user.id },
        // The sidebar only needs identity, visual settings, and recency. Field
        // schemas are loaded by the detail endpoint for the active form.
        attributes: ['id', 'title', 'description', 'settings', 'responseCount', 'createdAt', 'updatedAt'],
        order: [['updatedAt', 'DESC']]
    });
    res.json(forms);
});

export const getForm = asyncHandler(async (req, res) => {
    const form = await Form.findOne({ where: { id: req.params.id, userId: req.user.id } });
    if (!form) return res.status(404).json({ message: 'Form not found' });
    res.json(form);
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
    const { command, clarificationMode, requestId, expectedStateVersion } = req.body || {};
    const useSSE = String(req.headers.accept || '').includes('text/event-stream');

    if (useSSE) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders?.();
    }

    const emit = data => {
        if (useSSE && !res.writableEnded) {
            res.write(`data: ${JSON.stringify(data)}\n\n`);
            res.flush?.();
        }
    };
    try {
        const result = await formAssistant.submitTurn({
            userId: req.user.id,
            formId,
            command,
            clarificationMode,
            expectedStateVersion,
            requestId,
            onProgress: progress => emit({ type: 'progress', ...progress })
        });

        if (useSSE) {
            emit({ type: 'complete', result });
            return res.end();
        }
        res.status(201).json(result);
    } catch (error) {
        if (useSSE && !res.writableEnded) {
            emit({
                type: 'error',
                code: error.code || 'FORM_AI_FAILED',
                message: error.message || 'Form AI turn failed.',
                issues: error.issues || [],
                ...(Number.isInteger(error.currentStateVersion) ? { currentStateVersion: error.currentStateVersion } : {})
            });
            return res.end();
        }
        throw error;
    }
});

export const clearFormAIChat = asyncHandler(async (req, res) => {
    const result = await formAssistant.clearChat({ userId: req.user.id, formId: req.params.formId });
    res.json(result);
});

export const resetFormAIContext = asyncHandler(async (req, res) => {
    const result = await formAssistant.resetContext({ userId: req.user.id, formId: req.params.formId });
    res.json(result);
});

export const decideFormProposal = asyncHandler(async (req, res) => {
    const { formId, messageId } = req.params;
    const { action = 'accept', selectedPatchIds, expectedStateVersion } = req.body || {};
    try {
        const result = await formAssistant.decideProposal({
            userId: req.user.id,
            formId,
            proposalMessageId: messageId,
            action,
            selectedPatchIds,
            expectedStateVersion
        });
        res.json(result);
    } catch (error) {
        if (error.code === 'FORM_AI_STATE_CONFLICT') {
            return res.status(409).json({
                code: error.code,
                message: error.message,
                ...(Number.isInteger(error.currentStateVersion) ? { currentStateVersion: error.currentStateVersion } : {})
            });
        }
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
    const { response, formUserId } = await sequelize.transaction(async transaction => {
        // Responses are public, but submissions for the same form must be
        // serialized so a response limit and its denormalized counter remain
        // correct under concurrent requests.
        const form = await Form.findByPk(formId, { transaction, lock: transaction.LOCK.UPDATE });
        if (!form) {
            const error = new Error('Form not found');
            error.status = 404;
            throw error;
        }

        if (form.settings?.acceptingResponses === false) {
            const error = new Error('This form is no longer accepting responses');
            error.status = 400;
            throw error;
        }

        if (form.settings?.hasResponseLimit && form.settings.responseLimit
            && form.responseCount >= parseInt(form.settings.responseLimit, 10)) {
            const error = new Error('This form has reached its response limit');
            error.status = 400;
            throw error;
        }

        const response = await FormResponse.create({
            formId,
            responseData,
            snapshot: form.fields
        }, { transaction });
        await form.increment('responseCount', { transaction });
        return { response, formUserId: form.userId };
    });

    // ── Fire-and-forget: dispatch any workflows bound to this form ──────────
    const initialPayload = {
        fields:      responseData,
        responseId:  response.id,
        submittedAt: response.createdAt,
    };
    WorkflowTriggerBinding.findAll({
        where: { kind: 'form-submission', resourceId: formId, status: 'active' },
        attributes: ['workflowId', 'revisionId', 'userId']
    })
        .then(bindings => {
            for (const binding of bindings) {
                executeWorkflow(binding.workflowId, binding.userId || formUserId, initialPayload, {
                    runType: 'production',
                    revisionId: binding.revisionId,
                    trigger: 'form-submission'
                }).catch(err => console.error(`[FormTrigger] Dispatch failed for workflow ${binding.workflowId}:`, err.message));
            }
        })
        .catch(err => console.error('[FormTrigger] Failed to load trigger bindings for dispatch:', err.message));
    // ────────────────────────────────────────────────────────────────────────
    
    res.status(201).json(response);
});

export const getFormResponses = asyncHandler(async (req, res) => {
    const { formId } = req.params;
    const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
    const pageSize = Math.min(Math.max(Number.parseInt(req.query.pageSize || req.query.limit, 10) || 25, 1), 100);

    // Check form belongs to user
    const form = await Form.findOne({ where: { id: formId, userId: req.user.id } });
    if (!form) return res.status(404).json({ message: 'Form not found' });

    const { rows, count } = await FormResponse.findAndCountAll({ 
        where: { formId },
        order: [['createdAt', 'DESC']],
        limit: pageSize,
        offset: (page - 1) * pageSize
    });
    res.json({ data: rows, pagination: { page, pageSize, total: count, totalPages: Math.max(Math.ceil(count / pageSize), 1) } });
});

// Form Chat History
export const getFormChatHistory = asyncHandler(async (req, res) => {
    const result = await formAssistant.getHistory({
        userId: req.user.id,
        formId: req.params.formId,
        limit: req.query.limit,
        before: req.query.before || null
    });
    res.json(result);
});
