import asyncHandler from '../../utils/asyncHandler.js';
import { runCustomCode } from '../../services/codeRunner/customCodeRunner.js';

export const testCustomCode = asyncHandler(async (req, res) => {
    try {
        const result = await runCustomCode({ code: req.body?.code, input: req.body?.input || {}, variables: req.body?.variables || {}, metadata: { userId: req.user.id, test: true }, timeoutMs: req.body?.timeoutMs });
        res.json({ success: true, ...result });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});
