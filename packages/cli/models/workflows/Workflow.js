import { DataTypes } from 'sequelize';
import sequelize from '../../db/index.js';
import crypto from 'crypto';

const Workflow = sequelize.define(
    'Automation',
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
        description: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        revision: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 1
        },
        draftRevisionId: {
            type: DataTypes.STRING(100),
            allowNull: true
        },
        publishedRevisionId: {
            type: DataTypes.STRING(100),
            allowNull: true
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
        },
        demoKey: {
            type: DataTypes.STRING(80),
            allowNull: true
        }
    },
    {
        tableName: 'automations',
        timestamps: true,
        indexes: [
            { fields: ['userId', 'updatedAt'], name: 'workflows_user_updated' },
            { fields: ['userId', 'isActive'], name: 'workflows_user_active' },
            { fields: ['userId', 'status'], name: 'workflows_user_status' },
            { fields: ['userId', 'demoKey'], name: 'workflows_user_demo' },
            { fields: ['isActive'], name: 'workflows_active' },
        ]
    }
);

export default Workflow;
