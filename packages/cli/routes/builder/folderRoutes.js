import { Router } from 'express';
import asyncHandler from '../../utils/asyncHandler.js';
import { requireAuth } from '../../middleware/authMiddleware.js';
import { 
    getFolders, createFolder, updateFolder, deleteFolder 
} from '../../controllers/builder/folderController.js';

const router = Router();

router.use(requireAuth);

router.get('/', asyncHandler(getFolders));
router.post('/', asyncHandler(createFolder));
router.put('/:id', asyncHandler(updateFolder));
router.delete('/:id', asyncHandler(deleteFolder));

export default router;
