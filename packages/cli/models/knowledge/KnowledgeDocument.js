import { DataTypes } from 'sequelize';
import sequelize from '../../db/index.js';
import crypto from 'node:crypto';

const KnowledgeDocument = sequelize.define('KnowledgeDocument', {
    id: { type: DataTypes.STRING(100), primaryKey: true, defaultValue: () => `kdoc_${crypto.randomUUID().replaceAll('-', '')}` },
    knowledgeBaseId: { type: DataTypes.STRING(100), allowNull: false },
    userId: { type: DataTypes.UUID, allowNull: false },
    assetId: { type: DataTypes.STRING(100), allowNull: true },
    title: { type: DataTypes.STRING(255), allowNull: false },
    content: { type: DataTypes.TEXT, allowNull: false },
    status: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'ready' }
}, { tableName: 'knowledge_documents', timestamps: true, indexes: [{ fields: ['knowledgeBaseId', 'createdAt'] }] });

export default KnowledgeDocument;
