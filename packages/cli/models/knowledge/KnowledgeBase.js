import { DataTypes } from 'sequelize';
import sequelize from '../../db/index.js';
import crypto from 'node:crypto';

const KnowledgeBase = sequelize.define('KnowledgeBase', {
    id: { type: DataTypes.STRING(100), primaryKey: true, defaultValue: () => `kb_${crypto.randomUUID().replaceAll('-', '')}` },
    userId: { type: DataTypes.UUID, allowNull: false },
    name: { type: DataTypes.STRING(255), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true }
}, { tableName: 'knowledge_bases', timestamps: true, indexes: [{ fields: ['userId', 'createdAt'] }] });

export default KnowledgeBase;
