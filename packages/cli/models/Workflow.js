import { DataTypes } from 'sequelize';
import sequelize from '../db/index.js';
import crypto from 'crypto';

const Workflow = sequelize.define(
    'Workflow',
    {
        id: {
            type: DataTypes.STRING(100),
            primaryKey: true,
            defaultValue: () => `w_${crypto.randomUUID().replace(/-/g, '')}`
        },
        name: {
            type: DataTypes.STRING(255),
            allowNull: false
        },
        isActive: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },
        status: {
            type: DataTypes.STRING(50),
            defaultValue: 'Saved'
        },
        icon: {
            type: DataTypes.STRING(50),
            defaultValue: 'default'
        },
        iconColor: {
            type: DataTypes.STRING(50),
            allowNull: true
        },
        iconBg: {
            type: DataTypes.STRING(50),
            allowNull: true
        },
        nodes: {
            type: DataTypes.JSONB,
            defaultValue: []
        },
        edges: {
            type: DataTypes.JSONB,
            defaultValue: []
        }
    },
    {
        tableName: 'workflows',
        timestamps: true,
        indexes: [
            { fields: ['userId'] },
            { fields: ['userId', 'isActive'] },
            { fields: ['isActive'] },
            { fields: ['folderId'] }
        ]
    }
);

export default Workflow;
