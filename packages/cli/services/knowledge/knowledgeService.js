import { QueryTypes } from 'sequelize';
import { KnowledgeBase, KnowledgeChunk, KnowledgeDocument } from '../../models/index.js';
import { downloadAsset } from '../storage/assetService.js';
import { createEmbedding } from '../ai/media/embeddingProvider.js';

const splitText = text => {
    const words = String(text || '').split(/\s+/).filter(Boolean);
    const chunks = [];
    for (let index = 0; index < words.length; index += 700) chunks.push(words.slice(index, index + 850).join(' '));
    return chunks.length > 0 ? chunks : [''];
};

const readAssetText = assetData => {
    if (!/^text\//.test(assetData.asset.mimeType) && !['application/json', 'text/csv'].includes(assetData.asset.mimeType)) throw new Error('Knowledge-base ingestion currently accepts text, JSON, and CSV assets.');
    return assetData.buffer.toString('utf8');
};

export const ingestAsset = async ({ userId, knowledgeBaseId, assetId, title = null }) => {
    const base = await KnowledgeBase.findOne({ where: { id: knowledgeBaseId, userId } });
    if (!base) throw new Error('Knowledge base not found.');
    const assetData = await downloadAsset({ id: assetId, userId });
    const content = readAssetText(assetData);
    const document = await KnowledgeDocument.create({ knowledgeBaseId, userId, assetId, title: title || assetData.asset.originalName, content, status: 'processing' });
    const chunks = splitText(content);
    try {
        for (const [index, chunk] of chunks.entries()) {
            const embedding = await createEmbedding(chunk);
            if (embedding.length !== 1536) throw new Error('Embedding provider returned an unexpected vector size.');
            const row = await KnowledgeChunk.create({ knowledgeBaseId, documentId: document.id, userId, content: chunk, metadata: { index, title: document.title } });
            await KnowledgeChunk.sequelize.query('UPDATE "knowledge_chunks" SET "embedding" = CAST(:embedding AS vector) WHERE "id" = :id', { replacements: { embedding: `[${embedding.join(',')}]`, id: row.id } });
        }
        await document.update({ status: 'ready' });
        return document;
    } catch (error) {
        await document.update({ status: 'failed' });
        throw error;
    }
};

export const searchKnowledgeBase = async ({ userId, knowledgeBaseId, query, topK = 5 }) => {
    const base = await KnowledgeBase.findOne({ where: { id: knowledgeBaseId, userId } });
    if (!base) throw new Error('Knowledge base not found.');
    const embedding = await createEmbedding(query);
    const rows = await KnowledgeChunk.sequelize.query(`SELECT id, "documentId", content, metadata, 1 - (embedding <=> CAST(:embedding AS vector)) AS similarity FROM "knowledge_chunks" WHERE "knowledgeBaseId" = :knowledgeBaseId AND "userId" = :userId AND embedding IS NOT NULL ORDER BY embedding <=> CAST(:embedding AS vector) LIMIT :topK`, { replacements: { embedding: `[${embedding.join(',')}]`, knowledgeBaseId, userId, topK: Math.min(Math.max(Number(topK) || 5, 1), 20) }, type: QueryTypes.SELECT });
    return rows;
};

export const listKnowledgeBases = ({ userId }) => KnowledgeBase.findAll({ where: { userId }, order: [['updatedAt', 'DESC']], limit: 100 });

export { splitText };
