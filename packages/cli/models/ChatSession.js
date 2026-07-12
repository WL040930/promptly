import { DataTypes } from 'sequelize';
import sequelize from '../db/index.js';
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
        }
    },
    {
        tableName: 'chat_sessions',
        timestamps: true,
        indexes: [
            { fields: ['userId'] },
            { fields: ['userId', 'updatedAt'] }
        ]
    }
);

export default ChatSession;
