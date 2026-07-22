import { DataTypes } from 'sequelize';
import sequelize from '../../db/index.js';
import crypto from 'node:crypto';

const WorkflowRun = sequelize.define('WorkflowRun', {
    id: { type: DataTypes.STRING(100), primaryKey: true, defaultValue: () => `run_${crypto.randomUUID().replaceAll('-', '')}` },
    workflowId: { type: DataTypes.STRING(100), allowNull: false },
    userId: { type: DataTypes.UUID, allowNull: false },
    revisionId: { type: DataTypes.STRING(100), allowNull: true },
    status: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'running' },
    trigger: { type: DataTypes.STRING(255), allowNull: true },
    state: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    suspendedNodeId: { type: DataTypes.STRING(100), allowNull: true },
    executionLogId: { type: DataTypes.STRING(100), allowNull: true },
    lastError: { type: DataTypes.TEXT, allowNull: true },
    completedAt: { type: DataTypes.DATE, allowNull: true }
}, {
    tableName: 'workflow_runs',
    timestamps: true,
    indexes: [
        { fields: ['workflowId', 'createdAt'] },
        { fields: ['status', 'updatedAt'] },
        { fields: ['userId', 'createdAt'] }
    ]
});

export default WorkflowRun;
