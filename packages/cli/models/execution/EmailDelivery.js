import { DataTypes } from 'sequelize';
import sequelize from '../../db/index.js';
import crypto from 'crypto';

const EmailDelivery = sequelize.define(
    'EmailDelivery',
    {
        id: {
            type: DataTypes.STRING(100),
            primaryKey: true,
            defaultValue: () => `email_${crypto.randomUUID().replace(/-/g, '')}`
        },
        workflowId: { type: DataTypes.STRING(100), allowNull: false },
        userId: { type: DataTypes.UUID, allowNull: false },
        nodeId: { type: DataTypes.STRING(100), allowNull: false },
        idempotencyKey: { type: DataTypes.STRING(255), allowNull: false },
        provider: { type: DataTypes.STRING(50), allowNull: false },
        status: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'pending' },
        messageId: { type: DataTypes.STRING(255), allowNull: true },
        recipientHash: { type: DataTypes.STRING(64), allowNull: false },
        subjectHash: { type: DataTypes.STRING(64), allowNull: false },
        attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
        lastError: { type: DataTypes.TEXT, allowNull: true },
        sentAt: { type: DataTypes.DATE, allowNull: true }
    },
    {
        tableName: 'email_deliveries',
        timestamps: true,
        indexes: [
            {
                unique: true,
                fields: ['workflowId', 'nodeId', 'idempotencyKey'],
                name: 'email_delivery_idempotency'
            },
            { fields: ['userId', 'createdAt'] }
        ]
    }
);

export default EmailDelivery;
