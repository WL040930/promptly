import { DataTypes } from 'sequelize';
import sequelize from '../db/index.js';
import crypto from 'crypto';

const Form = sequelize.define(
    'Form',
    {
        id: {
            type: DataTypes.STRING(100),
            primaryKey: true,
            defaultValue: () => `form_${crypto.randomUUID().replace(/-/g, '')}`
        },
        title: {
            type: DataTypes.STRING(255),
            allowNull: false
        },
        description: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        settings: {
            type: DataTypes.JSONB,
            defaultValue: {}
        },
        fields: {
            type: DataTypes.JSONB,
            defaultValue: []
        }
    },
    {
        tableName: 'forms',
        timestamps: true
    }
);

export default Form;
