import { DataTypes } from 'sequelize';
import sequelize from '../../db/index.js';
import crypto from 'node:crypto';

const KnowledgeChunk = sequelize.define('KnowledgeChunk', {
    id: { type: DataTypes.STRING(100), primaryKey: true, defaultValue: () => `kchunk_${crypto.randomUUID().replaceAll('-', '')}` },
    knowledgeBaseId: { type: DataTypes.STRING(100), allowNull: false },
    documentId: { type: DataTypes.STRING(100), allowNull: false },
    userId: { type: DataTypes.UUID, allowNull: false },
    content: { type: DataTypes.TEXT, allowNull: false },
    metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} }
}, { tableName: 'knowledge_chunks', timestamps: true, indexes: [{ fields: ['knowledgeBaseId'] }, { fields: ['documentId'] }] });

export default KnowledgeChunk;
