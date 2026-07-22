import { Router } from 'express';
import express from 'express';
import { downloadFile, uploadFile } from '../../controllers/storage/storageController.js';
import { downloadWorkflowAsset, listWorkflowAssets, uploadWorkflowAsset } from '../../controllers/storage/assetController.js';
import { requireAuth } from '../../middleware/authMiddleware.js';

const router = Router();

router.get('/download/:filename', downloadFile);
router.post('/upload/:filename', express.raw({ type: '*/*', limit: '50mb' }), uploadFile);
router.get('/assets', requireAuth, listWorkflowAssets);
router.get('/assets/:id', requireAuth, downloadWorkflowAsset);
router.post('/assets', requireAuth, express.raw({ type: '*/*', limit: '50mb' }), uploadWorkflowAsset);

export default router;
