import { Form, FormResponse } from '../../models/index.js';
import { generateFormFromPrompt } from '../../services/aiFormsService.js';

export const getForms = async (req, res) => {
    const forms = await Form.findAll({ where: { userId: req.user.id } });
    res.json(forms);
};

export const createForm = async (req, res) => {
    const { title, description, settings, fields } = req.body;
    const form = await Form.create({ title, description, settings, fields, userId: req.user.id });
    res.status(201).json(form);
};

export const generateForm = async (req, res) => {
    try {
        const { prompt, currentSchema } = req.body;
        if (!prompt) {
            return res.status(400).json({ message: 'Prompt is required' });
        }
        const generatedForm = await generateFormFromPrompt(prompt, currentSchema);
        res.json(generatedForm);
    } catch (error) {
        console.error('Error in generateForm:', error);
        res.status(500).json({ message: 'Failed to generate form schema' });
    }
};

export const updateForm = async (req, res) => {
    const { id } = req.params;
    const { title, description, settings, fields } = req.body;
    
    const form = await Form.findOne({ where: { id, userId: req.user.id } });
    if (!form) return res.status(404).json({ message: 'Form not found' });
    
    await form.update({ title, description, settings, fields });
    res.json(form);
};

export const deleteForm = async (req, res) => {
    const { id } = req.params;
    const form = await Form.findOne({ where: { id, userId: req.user.id } });
    if (!form) return res.status(404).json({ message: 'Form not found' });
    
    await form.destroy();
    res.json({ message: 'Form deleted' });
};

// Public Form view
export const getPublicForm = async (req, res) => {
    const { id } = req.params;
    const form = await Form.findByPk(id, {
        attributes: ['id', 'title', 'description', 'settings', 'fields']
    });
    if (!form) return res.status(404).json({ message: 'Form not found' });

    // If there is a limit, check if it's reached. If so, override acceptingResponses for the client.
    if (form.settings && form.settings.hasResponseLimit && form.settings.responseLimit) {
        const count = await FormResponse.count({ where: { formId: id } });
        if (count >= parseInt(form.settings.responseLimit, 10)) {
            const updatedSettings = { ...form.settings, acceptingResponses: false };
            form.settings = updatedSettings;
        }
    }

    res.json(form);
};

// Form Responses
export const submitFormResponse = async (req, res) => {
    const { formId } = req.params;
    const { responseData } = req.body;
    
    // We don't check for req.user here because responses are likely anonymous/public
    const form = await Form.findByPk(formId);
    if (!form) return res.status(404).json({ message: 'Form not found' });

    // Check acceptingResponses
    if (form.settings && form.settings.acceptingResponses === false) {
        return res.status(400).json({ message: 'This form is no longer accepting responses' });
    }

    // Check responseLimit
    if (form.settings && form.settings.hasResponseLimit && form.settings.responseLimit) {
        const count = await FormResponse.count({ where: { formId } });
        if (count >= parseInt(form.settings.responseLimit, 10)) {
            return res.status(400).json({ message: 'This form has reached its response limit' });
        }
    }

    // Save a snapshot of the current fields to prevent schema drift issues
    const snapshot = form.fields;

    const response = await FormResponse.create({ formId, responseData, snapshot });
    res.status(201).json(response);
};

export const getFormResponses = async (req, res) => {
    const { formId } = req.params;
    // Check form belongs to user
    const form = await Form.findOne({ where: { id: formId, userId: req.user.id } });
    if (!form) return res.status(404).json({ message: 'Form not found' });

    const responses = await FormResponse.findAll({ where: { formId } });
    res.json(responses);
};
