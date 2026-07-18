import { DataTypes } from 'sequelize';
import sequelize from '../../db/index.js';

const OnboardingProgress = sequelize.define(
    'OnboardingProgress',
    {
        userId: {
            type: DataTypes.UUID,
            primaryKey: true
        },
        version: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 1
        },
        status: {
            type: DataTypes.STRING(20),
            allowNull: false,
            defaultValue: 'not_started'
        },
        currentStep: {
            type: DataTypes.STRING(40),
            allowNull: true
        },
        firstAutomationId: {
            type: DataTypes.STRING(100),
            allowNull: true
        },
        startedAt: {
            type: DataTypes.DATE,
            allowNull: true
        },
        completedAt: {
            type: DataTypes.DATE,
            allowNull: true
        }
    },
    { tableName: 'user_onboarding', timestamps: true }
);

export default OnboardingProgress;
