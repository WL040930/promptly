import { DataTypes } from 'sequelize';
import sequelize from '../../db/index.js';
import crypto from 'crypto';

const AgentRun = sequelize.define(
    'AgentRun',
    {
        id: {
            type: DataTypes.STRING(100),
            primaryKey: true,
            defaultValue: () => `run_${crypto.randomUUID().replace(/-/g, '')}`
        },
        sessionId: { type: DataTypes.STRING(100), allowNull: false },
        userId: { type: DataTypes.UUID, allowNull: false },
        status: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'received' },
        intent: { type: DataTypes.JSONB, defaultValue: null },
        plan: { type: DataTypes.JSONB, defaultValue: null },
        steps: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
        artifacts: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
        approval: { type: DataTypes.JSONB, defaultValue: null },
        currentStep: { type: DataTypes.STRING(100), allowNull: true },
        tokenUsage: { type: DataTypes.JSONB, defaultValue: {} },
        error: { type: DataTypes.JSONB, defaultValue: null },
        metadata: { type: DataTypes.JSONB, defaultValue: {} }
    },
    {
        tableName: 'agent_runs',
        timestamps: true,
        indexes: [
            { fields: ['sessionId', 'createdAt'], name: 'agent_runs_session_created' }
        ]
    }
);

export default AgentRun;
