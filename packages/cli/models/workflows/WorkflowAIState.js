import { DataTypes } from 'sequelize';
import sequelize from '../../db/index.js';

const WorkflowAIState = sequelize.define(
    'WorkflowAIState',
    {
        workflowId: {
            type: DataTypes.STRING(100),
            primaryKey: true,
            allowNull: false
        },
        version: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 1
        },
        phase: {
            type: DataTypes.STRING(40),
            allowNull: false,
            defaultValue: 'idle'
        },
        mode: {
            type: DataTypes.STRING(40),
            allowNull: false,
            defaultValue: 'important_only'
        },
        activeWork: {
            type: DataTypes.JSONB,
            allowNull: true
        },
        openClarification: {
            type: DataTypes.JSONB,
            allowNull: true
        },
        activeProposalMessageId: {
            type: DataTypes.STRING(100),
            allowNull: true
        },
        inFlightRequestId: {
            type: DataTypes.STRING(100),
            allowNull: true
        },
        inFlightStartedAt: {
            type: DataTypes.DATE,
            allowNull: true
        },
        legacyImported: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false
        },
        legacySessionId: {
            type: DataTypes.STRING(100),
            allowNull: true
        }
    },
    {
        tableName: 'workflow_ai_states',
        timestamps: true
    }
);

export default WorkflowAIState;
