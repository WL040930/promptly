import { DataTypes } from 'sequelize';
import crypto from 'node:crypto';
import sequelize from '../../db/index.js';

const WorkflowTriggerBinding = sequelize.define(
    'WorkflowTriggerBinding',
    {
        id: {
            type: DataTypes.STRING(100),
            primaryKey: true,
            defaultValue: () => `trigbind_${crypto.randomUUID().replaceAll('-', '')}`
        },
        workflowId: { type: DataTypes.STRING(100), allowNull: false },
        revisionId: { type: DataTypes.STRING(100), allowNull: false },
        nodeId: { type: DataTypes.STRING(100), allowNull: false },
        userId: { type: DataTypes.UUID, allowNull: false },
        kind: { type: DataTypes.STRING(50), allowNull: false },
        resourceId: { type: DataTypes.STRING(255), allowNull: false },
        config: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
        status: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'active' }
    },
    {
        tableName: 'workflow_trigger_bindings',
        timestamps: true,
        indexes: [
            { unique: true, fields: ['workflowId', 'nodeId'], name: 'workflow_trigger_binding_workflow_node' },
            { fields: ['kind', 'resourceId', 'status'], name: 'workflow_trigger_binding_lookup' },
            { fields: ['workflowId', 'status'], name: 'workflow_trigger_binding_workflow_status' }
        ]
    }
);

export default WorkflowTriggerBinding;
