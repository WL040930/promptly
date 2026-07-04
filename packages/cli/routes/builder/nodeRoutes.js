import { Router } from 'express';
import NodeRegistry from '../../utils/NodeRegistry.js';

const router = Router();

router.get('/library', (req, res) => {
    try {
        const library = NodeRegistry.getUiLibrary();
        res.json(library);
    } catch (error) {
        console.error('Error fetching node library:', error);
        res.status(500).json({ error: 'Failed to fetch node library' });
    }
});

export default router;
