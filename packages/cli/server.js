import app from './app.js';
import sequelize from './db/index.js';
import env from './config/env.js';

const startServer = async () => {
  try {
    await sequelize.authenticate();
    await sequelize.sync();
    app.listen(env.app.port, () => {
      console.log(`🚀 Server running on http://localhost:${env.app.port}`);
      console.log(`📚 API Health: http://localhost:${env.app.port}/api/health`);
    });
  } catch (error) {
    console.error('Database connection failed:', error);
    process.exit(1);
  }
};

startServer();