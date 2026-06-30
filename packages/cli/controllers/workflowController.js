import { Workflow } from '../models/index.js';
import { executeWorkflow } from '../services/executionEngine.js';

export const getWorkflows = async (req, res) => {
    const workflows = await Workflow.findAll({ where: { userId: req.user.id } });
    res.json(workflows);
};

export const createWorkflow = async (req, res) => {
    const { name, folderId, status, lastEdited, iconColor, iconBg, nodes } = req.body;
    const workflow = await Workflow.create({
        name, folderId, status, lastEdited, iconColor, iconBg, nodes,
        userId: req.user.id
    });
    res.status(201).json(workflow);
};

export const updateWorkflow = async (req, res) => {
    const { id } = req.params;
    const { name, folderId, status, lastEdited, iconColor, iconBg, nodes } = req.body;
    
    const workflow = await Workflow.findOne({ where: { id, userId: req.user.id } });
    if (!workflow) return res.status(404).json({ message: 'Workflow not found' });
    
    await workflow.update({ name, folderId, status, lastEdited, iconColor, iconBg, nodes });
    res.json(workflow);
};

export const deleteWorkflow = async (req, res) => {
    const { id } = req.params;
    const workflow = await Workflow.findOne({ where: { id, userId: req.user.id } });
    if (!workflow) return res.status(404).json({ message: 'Workflow not found' });
    
    await workflow.destroy();
    res.json({ message: 'Workflow deleted' });
};

export const triggerWorkflow = async (req, res) => {
    const { id } = req.params;
    const { payload } = req.body;
    const log = await executeWorkflow(id, req.user.id, payload);
    res.json(log);
};
