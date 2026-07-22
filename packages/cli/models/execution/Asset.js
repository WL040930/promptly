import { DataTypes } from 'sequelize';
import sequelize from '../../db/index.js';
import crypto from 'node:crypto';

const Asset = sequelize.define('Asset', {
    id: { type: DataTypes.STRING(100), primaryKey: true, defaultValue: () => `asset_${crypto.randomUUID().replaceAll('-', '')}` },
    userId: { type: DataTypes.UUID, allowNull: false },
    workflowId: { type: DataTypes.STRING(100), allowNull: true },
    runId: { type: DataTypes.STRING(100), allowNull: true },
    formId: { type: DataTypes.STRING(100), allowNull: true },
    storageKey: { type: DataTypes.STRING(500), allowNull: false, unique: true },
    bucket: { type: DataTypes.STRING(100), allowNull: false, defaultValue: 'workflow-assets' },
    originalName: { type: DataTypes.STRING(255), allowNull: false },
    mimeType: { type: DataTypes.STRING(150), allowNull: false },
    byteSize: { type: DataTypes.INTEGER, allowNull: false },
    checksum: { type: DataTypes.STRING(64), allowNull: false },
    status: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'clean' },
    source: { type: DataTypes.STRING(50), allowNull: false, defaultValue: 'upload' },
    metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} }
}, {
    tableName: 'workflow_assets',
    timestamps: true,
    indexes: [{ fields: ['userId', 'createdAt'] }, { fields: ['workflowId', 'createdAt'] }, { fields: ['checksum'] }]
});

export default Asset;
