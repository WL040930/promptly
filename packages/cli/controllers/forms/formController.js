import { Form, FormResponse, FormChatMessage } from '../../models/index.js';
import { generateFormFromPrompt } from '../../services/ai/aiFormsService.js';
import asyncHandler from '../../utils/asyncHandler.js';

export const getForms = asyncHandler(async (req, res) => {
    const forms = await Form.findAll({ where: { userId: req.user.id } });
    res.json(forms);
});

export const createForm = asyncHandler(async (req, res) => {
    const { title, description, settings, fields } = req.body;
    const form = await Form.create({ title, description, settings, fields, userId: req.user.id });
    res.status(201).json(form);
});

export const generateForm = asyncHandler(async (req, res) => {
    const { prompt, currentSchema, formId } = req.body;
    if (!prompt) {
        return res.status(400).json({ message: 'Prompt is required' });
    }
    
    let chatHistory = [];
    if (formId) {
        const rawHistory = await FormChatMessage.findAll({
            where: { formId },
            order: [['createdAt', 'DESC']],
            limit: 4 // Reduced from 12 to save tokens and speed up generation
        });
        // Reverse so they are in chronological order for the AI
        chatHistory = rawHistory.reverse();
    }

    const generatedForm = await generateFormFromPrompt(prompt, currentSchema, chatHistory);
    res.json(generatedForm);
});

export const updateForm = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { title, description, settings, fields } = req.body;
    
    const form = await Form.findOne({ where: { id, userId: req.user.id } });
    if (!form) return res.status(404).json({ message: 'Form not found' });
    
    await form.update({ title, description, settings, fields });
    res.json(form);
});

export const deleteForm = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const form = await Form.findOne({ where: { id, userId: req.user.id } });
    if (!form) return res.status(404).json({ message: 'Form not found' });
    
    await form.destroy();
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
    
    res.status(201).json(response);
});

export const getFormResponses = asyncHandler(async (req, res) => {
    const { formId } = req.params;
    // Check form belongs to user
    const form = await Form.findOne({ where: { id: formId, userId: req.user.id } });
    if (!form) return res.status(404).json({ message: 'Form not found' });

    const responses = await FormResponse.findAll({ where: { formId } });
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

export const addFormChatMessage = asyncHandler(async (req, res) => {
    const { formId } = req.params;
    const { sender, text, proposal, options, tokenUsage, isError } = req.body;

    const form = await Form.findOne({ where: { id: formId, userId: req.user.id } });
    if (!form) return res.status(404).json({ message: 'Form not found' });

    const message = await FormChatMessage.create({
        formId,
        sender,
        text,
        proposal,
        options,
        tokenUsage,
        isError
    });

    res.status(201).json(message);
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
    res.json(message);
});
