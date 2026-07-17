import { DataTypes } from 'sequelize';
import sequelize from '../db/index.js';
import crypto from 'crypto';

const FormChatMessage = sequelize.define(
    'FormChatMessage',
    {
        id: {
            type: DataTypes.STRING(100),
            primaryKey: true,
            defaultValue: () => `fmsg_${crypto.randomUUID().replace(/-/g, '')}`
        },
        formId: {
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
        proposal: {
            type: DataTypes.JSONB,
            allowNull: true
        },
        options: {
            type: DataTypes.JSONB,
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
            defaultValue: false
        }
    },
    {
        tableName: 'form_chat_messages',
        timestamps: true,
        indexes: [
            {
                fields: ['formId']
            },
            {
                fields: ['formId', 'createdAt']
            }
        ]
    }
);

export default FormChatMessage;
