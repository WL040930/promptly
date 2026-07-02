import { DataTypes } from 'sequelize';
import sequelize from '../db/index.js';

const Workflow = sequelize.define(
    'Workflow',
    {
        id: {
            type: DataTypes.STRING(100), // e.g., 'w1', 'w2' or UUID
            primaryKey: true,
            defaultValue: () => `w_${Date.now()}`
        },
        name: {
            type: DataTypes.STRING(255),
            allowNull: false
        },
        status: {
            type: DataTypes.STRING(50),
            defaultValue: 'Draft'
        },
        lastEdited: {
            type: DataTypes.STRING(100),
            allowNull: true
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
        timestamps: true
    }
);

export default Workflow;
