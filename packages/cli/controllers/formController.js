import { Form, FormResponse } from '../models/index.js';

export const getForms = async (req, res) => {
    const forms = await Form.findAll({ where: { userId: req.user.id } });
    res.json(forms);
};

export const createForm = async (req, res) => {
    const { title, description, settings, fields } = req.body;
    const form = await Form.create({ title, description, settings, fields, userId: req.user.id });
    res.status(201).json(form);
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

// Form Responses
export const submitFormResponse = async (req, res) => {
    const { formId } = req.params;
    const { responseData } = req.body;
    
    // We don't check for req.user here because responses are likely anonymous/public
    const form = await Form.findByPk(formId);
    if (!form) return res.status(404).json({ message: 'Form not found' });

    const response = await FormResponse.create({ formId, responseData });
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
