import { DataTypes } from 'sequelize';
import sequelize from '../../db/index.js';
import crypto from 'node:crypto';

const TriggerSubscription = sequelize.define(
    'TriggerSubscription',
    {
        id: {
            type: DataTypes.STRING(100),
            primaryKey: true,
            defaultValue: () => `trigsub_${crypto.randomUUID().replace(/-/g, '')}`
        },
        workflowId: { type: DataTypes.STRING(100), allowNull: false },
        nodeId: { type: DataTypes.STRING(100), allowNull: false },
        userId: { type: DataTypes.UUID, allowNull: false },
        provider: { type: DataTypes.STRING(50), allowNull: false },
        config: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
        configHash: { type: DataTypes.STRING(64), allowNull: false },
        status: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'active' },
        externalSubscriptionId: { type: DataTypes.STRING(255), allowNull: true },
        externalResourceId: { type: DataTypes.STRING(255), allowNull: true },
        cursor: { type: DataTypes.TEXT, allowNull: true },
        state: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
        expiresAt: { type: DataTypes.DATE, allowNull: true },
        lastEventAt: { type: DataTypes.DATE, allowNull: true },
        lastError: { type: DataTypes.TEXT, allowNull: true }
    },
    {
        tableName: 'trigger_subscriptions',
        timestamps: true,
        indexes: [
            { unique: true, fields: ['workflowId', 'nodeId'], name: 'trigger_subscription_workflow_node' },
            { fields: ['userId', 'provider', 'status'], name: 'trigger_subscriptions_user_provider_status' },
            { fields: ['provider', 'externalSubscriptionId', 'status'], name: 'trigger_subscriptions_external_lookup' },
            { fields: ['status', 'expiresAt'], name: 'trigger_subscriptions_expiry' }
        ]
    }
);

export default TriggerSubscription;
