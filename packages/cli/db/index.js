import { Sequelize } from 'sequelize';
import env from '../config/env.js';

const sequelize = new Sequelize(
    env.db.database,
    env.db.user,
    env.db.password,
    {
        host: env.db.host,
        port: env.db.port,
        dialect: 'postgres',
        logging: false,
        pool: {
            max: 10,    // Stay comfortably under PgBouncer/session-mode limits
            min: 2,     // Keep 2 connections warm — avoids cold-start latency on intermittent traffic
            acquire: 30000,
            idle: 30000 // 30s before eviction — reduces churn under intermittent load
        }
    }
);

export default sequelize;
