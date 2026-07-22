import { BaseNode } from '../../../BaseNode.js';
import { ingestAsset } from '../../../../cli/services/knowledge/knowledgeService.js';

export default class KnowledgeIngestNode extends BaseNode {
    async execute(context) {
        const config = this.getResolvedConfig(context);
        const document = await ingestAsset({ userId: context.metadata?.userId, knowledgeBaseId: config.knowledgeBaseId, assetId: config.assetId, title: config.title });
        return { success: true, outputData: document.toJSON(), documentId: document.id };
    }
}
