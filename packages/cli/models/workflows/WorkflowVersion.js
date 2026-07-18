import { DataTypes } from 'sequelize';
import sequelize from '../../db/index.js';
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
        baseRevisionId: {
            type: DataTypes.STRING(100),
            allowNull: true
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
        },
        source: {
            type: DataTypes.STRING(20),
            allowNull: false,
            defaultValue: 'system'
        },
        summary: {
            type: DataTypes.TEXT,
            allowNull: true
        }
    },
    {
        tableName: 'automation_revisions',
        timestamps: true,
        indexes: [
            {
                unique: true,
                fields: ['workflowId', 'versionNumber'],
                name: 'workflow_versions_workflow_version'
            }
        ]
    }
);

export default WorkflowVersion;
