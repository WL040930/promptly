import { DataTypes } from 'sequelize';
import sequelize from '../../db/index.js';
import crypto from 'node:crypto';

const AssistantMessage = sequelize.define(
    'AssistantMessage',
    {
        id: {
            type: DataTypes.STRING(100),
            primaryKey: true,
            defaultValue: () => `amsg_${crypto.randomUUID().replace(/-/g, '')}`
        },
        threadId: {
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
        }
    },
    {
        tableName: 'assistant_messages',
        timestamps: true,
        indexes: [
            { fields: ['threadId', 'createdAt'], name: 'assistant_messages_thread_created' }
        ]
    }
);

const baseToJSON = AssistantMessage.prototype.toJSON;
AssistantMessage.prototype.toJSON = function toJSON() {
    const value = baseToJSON.call(this);
    return {
        ...value,
        ...(this.kind === 'form_proposal' ? { proposal: { ...(this.payload || {}), status: this.proposalStatus || null } } : {}),
        ...(this.kind === 'clarification' ? { options: this.payload } : {})
    };
};

Object.defineProperties(AssistantMessage.prototype, {
    proposal: {
        get() {
            return this.kind === 'form_proposal' ? { ...(this.payload || {}), status: this.proposalStatus || null } : null;
        }
    },
    options: {
        get() {
            return this.kind === 'clarification' ? this.payload : null;
        }
    }
});

export default AssistantMessage;
