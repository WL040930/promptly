import { Router } from 'express';
import NodeRegistry from '../../utils/NodeRegistry.js';
import { requireAuth } from '../../middleware/authMiddleware.js';
import asyncHandler from '../../utils/asyncHandler.js';
import nodeResourceService from '../../services/nodes/nodeResourceService.js';
import { testCustomCode } from '../../controllers/builder/customCodeController.js';

const router = Router();

router.use(requireAuth);

router.get('/library', (req, res) => {
    try {
        const library = NodeRegistry.getUiLibrary();
        res.json(library);
    } catch (error) {
        console.error('Error fetching node library:', error);
        res.status(500).json({ error: 'Failed to fetch node library' });
    }
});

router.post('/custom-code/test', asyncHandler(testCustomCode));

router.get('/resources/:resource', asyncHandler(async (req, res) => {
    try {
        const result = await nodeResourceService.list({
            userId: req.user.id,
            resource: req.params.resource,
            params: req.query || {}
        });
        res.json(result);
    } catch (error) {
        if (error?.status) {
            return res.status(error.status).json({
                code: error.code,
                message: error.message,
                ...(error.action ? { action: error.action } : {})
            });
        }
        throw error;
    }
}));

export default router;
