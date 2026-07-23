import { DataTypes } from 'sequelize';
import sequelize from '../../db/index.js';
import crypto from 'crypto';

const WorkflowChatMessage = sequelize.define(
    'WorkflowChatMessage',
    {
        id: {
            type: DataTypes.STRING(100),
            primaryKey: true,
            defaultValue: () => `wmsg_${crypto.randomUUID().replace(/-/g, '')}`
        },
        workflowId: {
            type: DataTypes.STRING(100),
            allowNull: false
        },
        sender: {
            type: DataTypes.ENUM('user', 'bot'),
            allowNull: false
        },
        text: {
            type: DataTypes.TEXT,
            allowNull: false
        },
        kind: {
            type: DataTypes.STRING(40),
            allowNull: false,
            defaultValue: 'text'
        },
        payload: {
            type: DataTypes.JSONB,
            allowNull: true
        },
        proposalStatus: {
            type: DataTypes.STRING(20),
            allowNull: true
        },
        tokenUsage: {
            type: DataTypes.JSONB,
            allowNull: true
        },
        errorMetadata: {
            type: DataTypes.JSONB,
            allowNull: true
        },
        isError: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false
        },
        sourceMessageId: {
            type: DataTypes.STRING(100),
            allowNull: true,
            unique: true
        }
    },
    {
        tableName: 'workflow_chat_messages',
        timestamps: true,
        indexes: [
            { fields: ['workflowId', 'createdAt'], name: 'workflow_chat_messages_workflow_created' }
        ]
    }
);

export default WorkflowChatMessage;
