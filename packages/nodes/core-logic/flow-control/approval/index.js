import { BaseNode } from '../../../BaseNode.js';

export default class ApprovalNode extends BaseNode {
    async execute(context) {
        const config = this.getResolvedConfig(context);
        const assigneeType = config.assigneeType || (config.assigneeEmail ? 'external' : 'owner');
        const assigneeEmail = String(config.assigneeEmail || '').trim().toLowerCase();
        if (assigneeType === 'external' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(assigneeEmail)) {
            return { success: false, error: 'A valid external approver email is required.' };
        }
        if (context.metadata?.runType !== 'production') {
            return { success: true, outputData: { decision: 'approved', preview: true }, targetHandle: 'approved' };
        }
        const expiresAfterHours = Math.min(Math.max(Number(config.expiresAfterHours) || 72, 1), 720);
        return {
            success: true,
            suspend: {
                kind: 'approval',
                ...(assigneeType === 'external' ? { assigneeEmail } : { assigneeUserId: context.metadata?.userId || null }),
                availableAt: new Date().toISOString(),
                expiresAt: new Date(Date.now() + expiresAfterHours * 60 * 60 * 1000).toISOString(),
                payload: {
                    title: String(config.title || 'Review required'),
                    instructions: String(config.instructions || ''),
                    input: context.initialPayload || {}
                }
            }
        };
    }
}
