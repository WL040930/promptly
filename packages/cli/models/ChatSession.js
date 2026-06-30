import { DataTypes } from 'sequelize';
import sequelize from '../db/index.js';

const ChatSession = sequelize.define(
    'ChatSession',
    {
        id: {
            type: DataTypes.STRING(100),
            primaryKey: true,
            defaultValue: () => `chat_${Date.now()}`
        },
        title: {
            type: DataTypes.STRING,
            defaultValue: 'New Chat'
        },
        messages: {
            type: DataTypes.JSONB,
            defaultValue: []
        }
    },
    {
        tableName: 'chat_sessions',
        timestamps: true
    }
);

export default ChatSession;
