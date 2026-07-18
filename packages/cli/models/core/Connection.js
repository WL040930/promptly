import { DataTypes } from 'sequelize';
import sequelize from '../../db/index.js';
import crypto from 'crypto';

const Connection = sequelize.define(
    'Connection',
    {
        id: {
            type: DataTypes.STRING(100),
            primaryKey: true,
            defaultValue: () => `conn_${crypto.randomUUID().replace(/-/g, '')}`
        },
        userId: {
            type: DataTypes.UUID,
            allowNull: false
        },
        provider: {
            type: DataTypes.STRING(40),
            allowNull: false
        },
        externalAccountId: {
            type: DataTypes.STRING(255),
            allowNull: false
        },
        accountEmail: {
            type: DataTypes.STRING(255),
            allowNull: true
        },
        accessToken: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        refreshToken: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        tokenExpiresAt: {
            type: DataTypes.DATE,
            allowNull: true
        },
        scopes: {
            type: DataTypes.JSONB,
            defaultValue: []
        },
        status: {
            type: DataTypes.STRING(20),
            allowNull: false,
            defaultValue: 'active'
        },
        metadata: {
            type: DataTypes.JSONB,
            defaultValue: {}
        }
    },
    {
        tableName: 'connections',
        timestamps: true,
        indexes: [
            { unique: true, fields: ['userId', 'provider', 'externalAccountId'], name: 'connections_user_provider_account' },
            { fields: ['userId', 'provider', 'status'], name: 'connections_user_provider_status' }
        ]
    }
);

export default Connection;
