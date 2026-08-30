import { DataTypes } from 'sequelize';
import sequelize from '../../db/index.js';
import crypto from 'node:crypto';

const AutomationRun = sequelize.define('AutomationRun', {
    id: { type: DataTypes.STRING(100), primaryKey: true, defaultValue: () => `run_${crypto.randomUUID().replaceAll('-', '')}` },
    workflowId: { type: DataTypes.STRING(100), allowNull: false },
    userId: { type: DataTypes.UUID, allowNull: false },
    revisionId: { type: DataTypes.STRING(100), allowNull: true },
    definitionSnapshot: { type: DataTypes.JSONB, allowNull: true },
    workflowNameSnapshot: { type: DataTypes.STRING(255), allowNull: true },
    workflowDeletedAt: { type: DataTypes.DATE, allowNull: true },
    status: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'running' },
    trigger: { type: DataTypes.STRING(255), allowNull: true },
    state: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    suspendedNodeId: { type: DataTypes.STRING(100), allowNull: true },
    durationMs: { type: DataTypes.INTEGER, allowNull: true },
    tags: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    error: { type: DataTypes.TEXT, allowNull: true },
    steps: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    output: { type: DataTypes.JSONB, allowNull: true },
    completedAt: { type: DataTypes.DATE, allowNull: true },
    metricsRecordedAt: { type: DataTypes.DATE, allowNull: true },
    demoKey: { type: DataTypes.STRING(80), allowNull: true }
}, {
    tableName: 'automation_runs',
    timestamps: true,
    indexes: [
        { fields: ['workflowId', 'createdAt'], name: 'automation_runs_workflow_created' },
        { fields: ['workflowNameSnapshot'], name: 'automation_runs_workflow_name' },
        { fields: ['status', 'updatedAt'], name: 'automation_runs_status_updated' },
        { fields: ['userId', 'createdAt'], name: 'automation_runs_user_created' },
        { fields: ['userId', 'demoKey'], name: 'automation_runs_user_demo' },
        {
            name: 'automation_runs_user_status_created_id',
            fields: ['userId', 'status', { name: 'createdAt', order: 'DESC' }, { name: 'id', order: 'DESC' }]
        },
        {
            name: 'automation_runs_user_workflow_created_id',
            fields: ['userId', 'workflowId', { name: 'createdAt', order: 'DESC' }, { name: 'id', order: 'DESC' }]
        }
    ]
});

const baseToJSON = AutomationRun.prototype.toJSON;
Object.defineProperty(AutomationRun.prototype, 'time', {
    get() { return this.createdAt; }
});
AutomationRun.prototype.toJSON = function toJSON() {
    const value = baseToJSON.call(this);
    return { ...value, time: value.createdAt };
};

export default AutomationRun;
