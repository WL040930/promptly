import { Router } from 'express';
import { requireAuth } from '../../middleware/authMiddleware.js';
import { createBase, deleteBase, listBases } from '../../controllers/knowledge/knowledgeController.js';

const router = Router();
router.use(requireAuth);
router.get('/', listBases);
router.post('/', createBase);
router.delete('/:id', deleteBase);
export default router;
