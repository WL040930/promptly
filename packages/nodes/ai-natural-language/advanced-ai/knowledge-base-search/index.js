import { BaseNode } from '../../../BaseNode.js';
import { searchKnowledgeBase } from '../../../../cli/services/knowledge/knowledgeService.js';

export default class KnowledgeBaseSearchNode extends BaseNode {
    async execute(context) {
        const config = this.getResolvedConfig(context);
        const results = await searchKnowledgeBase({ userId: context.metadata?.userId, knowledgeBaseId: config.knowledgeBaseId, query: config.query, topK: config.topK });
        return { success: true, outputData: { results }, results };
    }
}
