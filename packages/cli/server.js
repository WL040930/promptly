import app from './app.js';
import env from './config/env.js';
import './models/index.js';
import NodeRegistry from './utils/NodeRegistry.js';
import SchedulerService from './services/scheduler/schedulerService.js';
import { startDatabaseChangePublisher } from './services/triggers/databaseTriggerService.js';
import { reconcileActiveWorkflows, startTriggerRuntime } from './services/triggers/triggerRuntime.js';
import { assertAIConfig } from './services/ai/core/configValidator.js';
import { startContinuationRuntime } from './services/engine/continuationService.js';
import { ensureDatabaseReady } from './db/bootstrap.js';

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
    // Keep automatic empty/reset-database setup, but share the API process's
    // connection lifecycle instead of paying for a separate bootstrap process.
    await Promise.all([
      ensureDatabaseReady(),
      NodeRegistry.init()
    ]);

    app.listen(env.app.port, () => {
      const localApiOrigin = `http://localhost:${env.app.port}`;
      console.log(`🚀 API running at ${localApiOrigin}`);
      console.log(`📚 API health: ${localApiOrigin}/api/health`);
      console.log(`🖥️ Browser origin: ${env.app.clientOrigin}`);
      if (env.app.siteOrigin) console.log(`🌐 Site origin: ${env.app.siteOrigin}`);
      if (env.app.triggerPublicOrigin) console.log(`🔔 Trigger origin: ${env.app.triggerPublicOrigin}`);
      void startBackgroundRuntimes();
    });
  } catch (error) {
    console.error('Database connection failed:', error);
    process.exit(1);
  }
};

startServer();
