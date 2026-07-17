import { DataTypes } from 'sequelize';
import sequelize from '../../db/index.js';
import crypto from 'crypto';

const ExecutionLog = sequelize.define(
    'ExecutionLog',
    {
        id: {
            type: DataTypes.STRING(100),
            primaryKey: true,
            defaultValue: () => `run_${crypto.randomUUID().replace(/-/g, '')}`
        },
        time: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW
        },
        durationMs: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        status: {
            type: DataTypes.STRING(50), // 'Success' | 'Failed'
            allowNull: false
        },
        trigger: {
            type: DataTypes.STRING(255),
            allowNull: true
        },
        tags: {
            type: DataTypes.JSONB,
            defaultValue: []
        },
        error: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        steps: {
            type: DataTypes.JSONB,
            defaultValue: []
        },
        output: {
            type: DataTypes.JSONB,
            allowNull: true
        }
    },
    {
        tableName: 'execution_logs',
        timestamps: true,
        indexes: [
            { fields: ['userId', 'time'], name: 'execution_logs_user_time' },
            { fields: ['userId', 'status', 'time'], name: 'execution_logs_user_status_time' },
            { fields: ['workflowId', 'time'], name: 'execution_logs_workflow_time' }
        ]
    }
);

export default ExecutionLog;
