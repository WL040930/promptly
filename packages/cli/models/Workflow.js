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
        status: {
            type: DataTypes.STRING(50),
            defaultValue: 'Draft'
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
            { fields: ['userId', 'status'] },
            { fields: ['folderId'] }
        ]
    }
);

export default Workflow;
