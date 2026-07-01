import { Router } from 'express';
import express from 'express';
import { downloadFile, uploadFile } from '../controllers/storageController.js';

const router = Router();

router.get('/download/:filename', downloadFile);
// We use express.raw to capture the raw binary body up to 50MB
router.post('/upload/:filename', express.raw({ type: '*/*', limit: '50mb' }), uploadFile);

export default router;
