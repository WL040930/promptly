import { DataTypes } from 'sequelize';
import sequelize from '../../db/index.js';

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
            unique: false
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
        },
        resetPasswordToken: {
            type: DataTypes.STRING(255),
            allowNull: true
        },
        resetPasswordExpires: {
            type: DataTypes.DATE,
            allowNull: true
        }
    },
    {
        tableName: 'users',
        timestamps: true,
        indexes: [
            { unique: true, fields: ['email'], name: 'users_email_unique' },
            { unique: true, fields: ['googleId'], name: 'users_google_id_unique' },
            {
                fields: ['resetPasswordToken', 'resetPasswordExpires'],
                name: 'users_password_reset_lookup'
            }
        ]
    }
);

export default User;
