import { DataTypes } from 'sequelize';
import sequelize from '../db/index.js';

const Folder = sequelize.define(
    'Folder',
    {
        id: {
            type: DataTypes.STRING(100), // e.g., 'f1', 'f2' or UUID
            primaryKey: true,
            defaultValue: () => `f_${Date.now()}`
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
        timestamps: true
    }
);

export default Folder;
