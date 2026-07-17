import { Router } from 'express';
import { handleGmailProviderEvent, handleGoogleDriveProviderEvent } from '../../controllers/system/providerEventController.js';

const router = Router();

router.post('/gmail', handleGmailProviderEvent);
router.post('/google-drive', handleGoogleDriveProviderEvent);

export default router;
