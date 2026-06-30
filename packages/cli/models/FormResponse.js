import { DataTypes } from 'sequelize';
import sequelize from '../db/index.js';

const FormResponse = sequelize.define(
    'FormResponse',
    {
        id: {
            type: DataTypes.STRING(100),
            primaryKey: true,
            defaultValue: () => `resp_${Date.now()}`
        },
        responseData: {
            type: DataTypes.JSONB,
            defaultValue: {}
        },
        snapshot: {
            type: DataTypes.JSONB,
            allowNull: true,
            comment: 'Snapshot of the form fields at the time of submission'
        },
        submittedAt: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW
        }
    },
    {
        tableName: 'form_responses',
        timestamps: true
    }
);

export default FormResponse;
