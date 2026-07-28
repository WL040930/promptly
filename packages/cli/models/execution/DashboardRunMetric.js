import { DataTypes } from 'sequelize';
import sequelize from '../../db/index.js';

const DashboardRunMetric = sequelize.define('DashboardRunMetric', {
    userId: { type: DataTypes.UUID, primaryKey: true },
    day: { type: DataTypes.DATEONLY, primaryKey: true },
    totalRuns: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    successRuns: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    completedRuns: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }
}, {
    tableName: 'dashboard_run_metrics',
    timestamps: true,
    indexes: [{ fields: ['userId', 'day'], name: 'dashboard_run_metrics_user_day' }]
});

export default DashboardRunMetric;
