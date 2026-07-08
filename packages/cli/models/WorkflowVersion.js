import { DataTypes } from 'sequelize';
import sequelize from '../db/index.js';
import crypto from 'crypto';

const WorkflowVersion = sequelize.define(
    'WorkflowVersion',
    {
        id: {
            type: DataTypes.STRING(100),
            primaryKey: true,
            defaultValue: () => `wv_${crypto.randomUUID().replace(/-/g, '')}`
        },
        workflowId: {
            type: DataTypes.STRING(100),
            allowNull: false
        },
        versionNumber: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        nodes: {
            type: DataTypes.JSONB,
            defaultValue: []
        },
        edges: {
            type: DataTypes.JSONB,
            defaultValue: []
        }
    },
    {
        tableName: 'workflow_versions',
        timestamps: true,
        indexes: [
            { fields: ['workflowId', 'versionNumber'] }
        ]
    }
);

export default WorkflowVersion;
