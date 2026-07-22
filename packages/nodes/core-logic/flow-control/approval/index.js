import { BaseNode } from '../../../BaseNode.js';

export default class ApprovalNode extends BaseNode {
    async execute(context) {
        const config = this.getResolvedConfig(context);
        const assigneeEmail = String(config.assigneeEmail || '').trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(assigneeEmail)) {
            return { success: false, error: 'A valid approver email is required.' };
        }
        if (context.metadata?.runType !== 'production') {
            return { success: true, outputData: { decision: 'approved', preview: true }, targetHandle: 'approved' };
        }
        const expiresAfterHours = Math.min(Math.max(Number(config.expiresAfterHours) || 72, 1), 720);
        return {
            success: true,
            suspend: {
                kind: 'approval',
                assigneeEmail,
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
