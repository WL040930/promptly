import { DataTypes } from 'sequelize';
import sequelize from '../../db/index.js';
import crypto from 'node:crypto';

export const ASSISTANT_SURFACES = Object.freeze(['ask_promptly', 'form', 'workflow']);

const initialState = () => ({
    version: 1,
    phase: 'idle',
    mode: 'important_only',
    activeWork: null,
    openClarification: null,
    activeProposalMessageId: null,
    inFlightRequestId: null,
    inFlightStartedAt: null
});

const AssistantThread = sequelize.define(
    'AssistantThread',
    {
        id: {
            type: DataTypes.STRING(100),
            primaryKey: true,
            defaultValue: () => `ath_${crypto.randomUUID().replace(/-/g, '')}`
        },
        userId: {
            type: DataTypes.UUID,
            allowNull: false
        },
        surface: {
            type: DataTypes.ENUM(...ASSISTANT_SURFACES),
            allowNull: false
        },
        formId: {
            type: DataTypes.STRING(100),
            allowNull: true
        },
        workflowId: {
            type: DataTypes.STRING(100),
            allowNull: true
        },
        title: {
            type: DataTypes.STRING(255),
            allowNull: false,
            defaultValue: 'New Chat'
        },
        context: {
            type: DataTypes.JSONB,
            allowNull: false,
            defaultValue: {}
        },
        state: {
            type: DataTypes.JSONB,
            allowNull: false,
            defaultValue: initialState
        }
    },
    {
        tableName: 'assistant_threads',
        timestamps: true,
        indexes: [
            { fields: ['userId', 'surface', 'updatedAt'], name: 'assistant_threads_user_surface_updated' },
            { unique: true, fields: ['formId'], name: 'assistant_threads_form_unique' },
            { unique: true, fields: ['workflowId'], name: 'assistant_threads_workflow_unique' }
        ]
    }
);

export { initialState };
export default AssistantThread;
