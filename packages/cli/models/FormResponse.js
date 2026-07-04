import { DataTypes } from 'sequelize';
import sequelize from '../db/index.js';
import crypto from 'crypto';

const FormResponse = sequelize.define(
    'FormResponse',
    {
        id: {
            type: DataTypes.STRING(100),
            primaryKey: true,
            defaultValue: () => `resp_${crypto.randomUUID().replace(/-/g, '')}`
        },
        responseData: {
            type: DataTypes.JSONB,
            defaultValue: {}
        },
        snapshot: {
            type: DataTypes.JSONB,
            allowNull: true,
            comment: 'Snapshot of the form fields at the time of submission'
        }
        // Note: submittedAt removed — use Sequelize's built-in createdAt instead
    },
    {
        tableName: 'form_responses',
        timestamps: true,
        indexes: [
            { fields: ['formId'] },
            { fields: ['formId', 'createdAt'] },
            {
                fields: ['responseData'],
                using: 'gin'
            }
        ]
    }
);

export default FormResponse;
