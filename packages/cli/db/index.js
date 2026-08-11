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
        dialectOptions: {
            application_name: env.db.applicationName,
            idle_in_transaction_session_timeout: env.db.idleInTransactionTimeoutMs,
            connectionTimeoutMillis: env.db.pool.acquire,
            keepAlive: true
        },
        pool: env.db.pool
    }
);

sequelize.addHook('afterConnect', async connection => {
    await connection.query('SELECT set_config($1, $2, false)', [
        'application_name',
        env.db.applicationName
    ]);
    await connection.query('SELECT set_config($1, $2, false)', [
        'idle_in_transaction_session_timeout',
        `${env.db.idleInTransactionTimeoutMs}ms`
    ]);
});

export const getDatabasePoolStats = () => {
    const pool = sequelize.connectionManager.pool;
    return {
        size: pool.size,
        max: pool.maxSize,
        min: pool.minSize,
        available: pool.available,
        using: pool.using,
        waiting: pool.waiting
    };
};

export default sequelize;
