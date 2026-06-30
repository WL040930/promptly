import { DataTypes } from 'sequelize';
import sequelize from '../db/index.js';

const ExecutionLog = sequelize.define(
    'ExecutionLog',
    {
        id: {
            type: DataTypes.STRING(100),
            primaryKey: true,
            defaultValue: () => `run_${Date.now()}`
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
        }
    },
    {
        tableName: 'execution_logs',
        timestamps: true
    }
);

export default ExecutionLog;
