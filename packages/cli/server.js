import app from './app.js';
import sequelize from './db/index.js';
import env from './config/env.js';
import './models/index.js';
import NodeRegistry from './utils/NodeRegistry.js';
import SchedulerService from './services/scheduler/schedulerService.js';
import { startDatabaseChangePublisher } from './services/triggers/databaseTriggerService.js';
import { reconcileActiveWorkflows, startTriggerRuntime } from './services/triggers/triggerRuntime.js';
import { assertAIConfig } from './services/ai/core/configValidator.js';
import { startContinuationRuntime } from './services/engine/continuationService.js';

const startBackgroundRuntimes = async () => {
  try {
    await reconcileActiveWorkflows();
    startDatabaseChangePublisher();
    await startTriggerRuntime();
    await startContinuationRuntime();
    await SchedulerService.start();
    console.log('[Runtime] Background services started.');
  } catch (error) {
    console.error('[Runtime] Background startup failed; the API remains available:', error.message);
  }
};

const startServer = async () => {
  try {
    assertAIConfig();
    await sequelize.authenticate();
    await NodeRegistry.init();

    app.listen(env.app.port, () => {
      console.log(`🚀 Server running on http://localhost:${env.app.port}`);
      console.log(`📚 API Health: http://localhost:${env.app.port}/api/health`);
      void startBackgroundRuntimes();
    });
  } catch (error) {
    console.error('Database connection failed:', error);
    process.exit(1);
  }
};

startServer();
