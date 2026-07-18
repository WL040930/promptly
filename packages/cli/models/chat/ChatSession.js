import { DataTypes } from 'sequelize';
import sequelize from '../../db/index.js';
import crypto from 'crypto';

const ChatSession = sequelize.define(
    'ChatSession',
    {
        id: {
            type: DataTypes.STRING(100),
            primaryKey: true,
            defaultValue: () => `chat_${crypto.randomUUID().replace(/-/g, '')}`
        },
        title: {
            type: DataTypes.STRING,
            defaultValue: 'New Chat'
        },
        messages: {
            type: DataTypes.JSONB,
            defaultValue: []
        },
        agentContext: {
            type: DataTypes.JSONB,
            defaultValue: {}
        },
        agentState: {
            type: DataTypes.JSONB,
            defaultValue: {}
        },
        automationId: {
            type: DataTypes.STRING(100),
            allowNull: true
        },
        purpose: {
            type: DataTypes.STRING(30),
            allowNull: false,
            defaultValue: 'general'
        }
    },
    {
        tableName: 'conversations',
        timestamps: true,
        indexes: [
            { fields: ['userId', 'updatedAt'], name: 'chat_sessions_user_updated' },
            { fields: ['userId', 'automationId', 'updatedAt'], name: 'chat_sessions_user_automation_updated' }
        ]
    }
);

export default ChatSession;
