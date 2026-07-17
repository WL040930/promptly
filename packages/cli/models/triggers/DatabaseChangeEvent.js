import { DataTypes } from 'sequelize';
import sequelize from '../../db/index.js';
import crypto from 'node:crypto';

const DatabaseChangeEvent = sequelize.define(
    'DatabaseChangeEvent',
    {
        id: {
            type: DataTypes.STRING(100),
            primaryKey: true,
            defaultValue: () => `db_evt_${crypto.randomUUID().replace(/-/g, '')}`
        },
        userId: { type: DataTypes.UUID, allowNull: false },
        resource: { type: DataTypes.STRING(100), allowNull: false },
        recordId: { type: DataTypes.STRING(100), allowNull: false },
        eventType: { type: DataTypes.STRING(30), allowNull: false },
        beforeData: { type: DataTypes.JSONB, allowNull: true },
        afterData: { type: DataTypes.JSONB, allowNull: true },
        changedFields: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
        publishedAt: { type: DataTypes.DATE, allowNull: true }
    },
    {
        tableName: 'database_change_events',
        timestamps: true,
        indexes: [
            { fields: ['publishedAt', 'createdAt'] },
            { fields: ['userId', 'resource', 'recordId'] }
        ]
    }
);

export default DatabaseChangeEvent;
