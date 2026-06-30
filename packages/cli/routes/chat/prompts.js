import { Router } from 'express';
import { requireAuth } from '../../middleware/authMiddleware.js';

const router = Router();

router.get('/', requireAuth, (req, res) => {
    res.json({
        prompts: [
            { id: 1, title: 'Sample Prompt 1', content: 'This is a sample prompt' },
            { id: 2, title: 'Sample Prompt 2', content: 'Another sample prompt' }
        ]
    });
});

router.post('/', requireAuth, (req, res) => {
    const { title, content } = req.body;
    res.json({
        message: 'Prompt created successfully',
        prompt: { id: Date.now(), title, content }
    });
});

export default router;
