import { Router } from 'express';
import express from 'express';
import { downloadFile, uploadFile } from '../../controllers/storage/storageController.js';

const router = Router();

router.get('/download/:filename', downloadFile);
router.post('/upload/:filename', express.raw({ type: '*/*', limit: '50mb' }), uploadFile);

export default router;
