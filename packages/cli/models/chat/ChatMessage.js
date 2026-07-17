import { DataTypes } from 'sequelize';
import sequelize from '../../db/index.js';
import crypto from 'crypto';

/**
 * ChatMessage — individual messages belonging to a ChatSession.
 * Extracted from the ChatSession.messages JSONB blob so messages can be
 * paginated, queried, and deleted individually without full row rewrites.
 */
const ChatMessage = sequelize.define(
    'ChatMessage',
    {
        id: {
            type: DataTypes.STRING(100),
            primaryKey: true,
            defaultValue: () => `msg_${crypto.randomUUID().replace(/-/g, '')}`
        },
        sender: {
            type: DataTypes.STRING(20), // 'user' | 'bot'
            allowNull: false
        },
        text: {
            type: DataTypes.TEXT,
            allowNull: false
        },
        kind: {
            type: DataTypes.STRING(40),
            defaultValue: 'text'
        },
        payload: {
            type: DataTypes.JSONB,
            defaultValue: null
        },
        proposalStatus: {
            type: DataTypes.STRING(20),
            allowNull: true
        },
        tokenUsage: {
            type: DataTypes.JSONB,
            defaultValue: null
        }
    },
    {
        tableName: 'chat_messages',
        timestamps: true,
        indexes: [
            { fields: ['sessionId', 'createdAt'], name: 'chat_messages_session_created' }
        ]
    }
);

export default ChatMessage;
