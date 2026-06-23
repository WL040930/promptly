import { DataTypes } from 'sequelize';
import sequelize from '../db/index.js';

const User = sequelize.define(
    'User',
    {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        email: {
            type: DataTypes.STRING(255),
            allowNull: false,
            unique: true,
            validate: {
                isEmail: true
            }
        },
        passwordHash: {
            type: DataTypes.STRING(255),
            allowNull: false
        },
        experienceLevel: {
            type: DataTypes.STRING(30),
            allowNull: true,
            defaultValue: null
        },
        googleId: {
            type: DataTypes.STRING(255),
            allowNull: true,
            unique: true
        },
        googleEmail: {
            type: DataTypes.STRING(255),
            allowNull: true
        },
        googleAccessToken: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        googleRefreshToken: {
            type: DataTypes.TEXT,
            allowNull: true
        }
    },
    {
        tableName: 'users',
        timestamps: true
    }
);

export default User;
