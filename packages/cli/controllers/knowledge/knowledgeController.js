import asyncHandler from '../../utils/asyncHandler.js';
import { KnowledgeBase } from '../../models/index.js';
import { listKnowledgeBases } from '../../services/knowledge/knowledgeService.js';

export const listBases = asyncHandler(async (req, res) => res.json(await listKnowledgeBases({ userId: req.user.id })));

export const createBase = asyncHandler(async (req, res) => {
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ message: 'Knowledge base name is required.' });
    const base = await KnowledgeBase.create({ userId: req.user.id, name, description: req.body?.description || null });
    res.status(201).json(base);
});

export const deleteBase = asyncHandler(async (req, res) => {
    const base = await KnowledgeBase.findOne({ where: { id: req.params.id, userId: req.user.id } });
    if (!base) return res.status(404).json({ message: 'Knowledge base not found.' });
    await base.destroy();
    res.json({ success: true });
});
