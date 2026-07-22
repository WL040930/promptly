import { DataTypes } from 'sequelize';
import sequelize from '../../db/index.js';
import crypto from 'node:crypto';

const WorkflowContinuation = sequelize.define('WorkflowContinuation', {
    id: { type: DataTypes.STRING(100), primaryKey: true, defaultValue: () => `cont_${crypto.randomUUID().replaceAll('-', '')}` },
    runId: { type: DataTypes.STRING(100), allowNull: false },
    workflowId: { type: DataTypes.STRING(100), allowNull: false },
    userId: { type: DataTypes.UUID, allowNull: false },
    nodeId: { type: DataTypes.STRING(100), allowNull: false },
    kind: { type: DataTypes.STRING(30), allowNull: false },
    status: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'pending' },
    availableAt: { type: DataTypes.DATE, allowNull: false },
    expiresAt: { type: DataTypes.DATE, allowNull: true },
    assigneeEmail: { type: DataTypes.STRING(255), allowNull: true },
    assigneeUserId: { type: DataTypes.UUID, allowNull: true },
    tokenHash: { type: DataTypes.STRING(64), allowNull: true },
    payload: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    resolution: { type: DataTypes.JSONB, allowNull: true },
    resolvedAt: { type: DataTypes.DATE, allowNull: true },
    resolvedBy: { type: DataTypes.UUID, allowNull: true },
    lastError: { type: DataTypes.TEXT, allowNull: true }
}, {
    tableName: 'workflow_continuations',
    timestamps: true,
    indexes: [
        { fields: ['status', 'availableAt', 'createdAt'] },
        { fields: ['runId', 'status'] },
        { unique: true, fields: ['tokenHash'], name: 'workflow_continuation_token_unique' }
    ]
});

export default WorkflowContinuation;
