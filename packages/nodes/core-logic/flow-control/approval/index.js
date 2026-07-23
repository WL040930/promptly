import { BaseNode } from '../../../BaseNode.js';

export default class ApprovalNode extends BaseNode {
    async execute(context) {
        const config = this.getResolvedConfig(context);
        if (context.metadata?.runType !== 'production') {
            return { success: true, outputData: { decision: 'approved', preview: true }, targetHandle: 'approved' };
        }
        return {
            success: true,
            suspend: {
                kind: 'approval',
                availableAt: new Date().toISOString(),
                payload: {
                    title: String(config.title || 'Review required'),
                    instructions: String(config.instructions || ''),
                    input: context.initialPayload || {}
                }
            }
        };
    }
}
