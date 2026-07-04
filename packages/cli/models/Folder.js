import { DataTypes } from 'sequelize';
import sequelize from '../db/index.js';
import crypto from 'crypto';

const Folder = sequelize.define(
    'Folder',
    {
        id: {
            type: DataTypes.STRING(100),
            primaryKey: true,
            defaultValue: () => `f_${crypto.randomUUID().replace(/-/g, '')}`
        },
        name: {
            type: DataTypes.STRING(255),
            allowNull: false
        },
        parentId: {
            type: DataTypes.STRING(100),
            allowNull: true
        }
    },
    {
        tableName: 'folders',
        timestamps: true,
        indexes: [
            { fields: ['userId'] },
            { fields: ['parentId'] }
        ]
    }
);

export default Folder;
