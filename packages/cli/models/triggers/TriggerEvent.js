import { DataTypes } from 'sequelize';
import sequelize from '../../db/index.js';
import crypto from 'node:crypto';

const TriggerEvent = sequelize.define(
    'TriggerEvent',
    {
        id: {
            type: DataTypes.STRING(100),
            primaryKey: true,
            defaultValue: () => `trigevt_${crypto.randomUUID().replace(/-/g, '')}`
        },
        subscriptionId: { type: DataTypes.STRING(100), allowNull: false },
        workflowId: { type: DataTypes.STRING(100), allowNull: false },
        nodeId: { type: DataTypes.STRING(100), allowNull: false },
        userId: { type: DataTypes.UUID, allowNull: false },
        provider: { type: DataTypes.STRING(50), allowNull: false },
        eventType: { type: DataTypes.STRING(100), allowNull: false },
        externalEventId: { type: DataTypes.STRING(255), allowNull: false },
        payload: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
        status: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'pending' },
        attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
        availableAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        lockedAt: { type: DataTypes.DATE, allowNull: true },
        processedAt: { type: DataTypes.DATE, allowNull: true },
        lastError: { type: DataTypes.TEXT, allowNull: true },
        correlationId: { type: DataTypes.STRING(255), allowNull: true },
        causationId: { type: DataTypes.STRING(255), allowNull: true },
        depth: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }
    },
    {
        tableName: 'trigger_events',
        timestamps: true,
        indexes: [
            { unique: true, fields: ['subscriptionId', 'externalEventId'], name: 'trigger_event_deduplication' },
            { fields: ['status', 'availableAt', 'createdAt'], name: 'trigger_events_queue_claim' },
            { fields: ['workflowId', 'createdAt'], name: 'trigger_events_workflow_created' }
        ]
    }
);

export default TriggerEvent;
