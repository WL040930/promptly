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
            max: 50,
            min: 0,
            acquire: 30000,
            idle: 10000
        }
    }
);

export default sequelize;
