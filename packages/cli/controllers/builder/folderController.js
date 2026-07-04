import { Folder } from '../../models/index.js';
import asyncHandler from '../../utils/asyncHandler.js';

export const getFolders = asyncHandler(async (req, res) => {
    const folders = await Folder.findAll({ where: { userId: req.user.id } });
    res.json(folders);
});

export const createFolder = asyncHandler(async (req, res) => {
    const { name, parentId } = req.body;
    const folder = await Folder.create({ name, parentId, userId: req.user.id });
    res.status(201).json(folder);
});

export const updateFolder = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { name, parentId } = req.body;
    
    const folder = await Folder.findOne({ where: { id, userId: req.user.id } });
    if (!folder) return res.status(404).json({ message: 'Folder not found' });
    
    await folder.update({ name, parentId });
    res.json(folder);
});

export const deleteFolder = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const folder = await Folder.findOne({ where: { id, userId: req.user.id } });
    if (!folder) return res.status(404).json({ message: 'Folder not found' });
    
    await folder.destroy();
    res.json({ message: 'Folder deleted' });
});
