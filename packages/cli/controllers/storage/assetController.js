import asyncHandler from '../../utils/asyncHandler.js';
import { createAsset, downloadAsset, listAssets } from '../../services/storage/assetService.js';

export const listWorkflowAssets = asyncHandler(async (req, res) => res.json(await listAssets({ userId: req.user.id })));

export const uploadWorkflowAsset = asyncHandler(async (req, res) => {
    const asset = await createAsset({ userId: req.user.id, buffer: req.body, originalName: req.headers['x-file-name'] || 'asset', mimeType: req.headers['content-type'] || 'application/octet-stream', workflowId: req.query.workflowId || null, source: 'workflow-upload' });
    res.status(201).json(asset);
});

export const downloadWorkflowAsset = asyncHandler(async (req, res) => {
    const { asset, buffer } = await downloadAsset({ id: req.params.id, userId: req.user.id });
    res.setHeader('Content-Type', asset.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${asset.originalName}"`);
    res.send(buffer);
});
