import app from './app.js';
import sequelize from './db/index.js';
import { ensureDatabaseSchema } from './db/schema.js';
import env from './config/env.js';
import './models/index.js';
import NodeRegistry from './utils/NodeRegistry.js';
import SchedulerService from './services/scheduler/schedulerService.js';
import { ensureDatabaseChangeTriggers, startDatabaseChangePublisher } from './services/triggers/databaseTriggerService.js';
import { reconcileActiveWorkflows, startTriggerRuntime } from './services/triggers/triggerRuntime.js';
import { assertAIConfig } from './services/ai/core/configValidator.js';
import { startContinuationRuntime } from './services/engine/continuationService.js';

const startServer = async () => {
  try {
    assertAIConfig();
    await sequelize.authenticate();
    // The clean-slate schema is created explicitly by the database bootstrap.
    // Keep sync non-destructive, then apply only explicit additive compatibility changes.
    await sequelize.sync();
    await ensureDatabaseSchema(sequelize);
    await ensureDatabaseChangeTriggers(sequelize);
    
    // Initialize the dynamic node registry
    await NodeRegistry.init();
    await reconcileActiveWorkflows();
    startDatabaseChangePublisher();
    await startTriggerRuntime();
    await startContinuationRuntime();
    
    // Auto-initialize private workflow assets and the legacy form bucket.
    try {
      await sequelize.query(`
        INSERT INTO storage.buckets (id, name, public)
        VALUES ('workflow-assets', 'workflow-assets', false)
        ON CONFLICT (id) DO NOTHING;
      `);
      await sequelize.query(`
        INSERT INTO storage.buckets (id, name, public) 
        VALUES ('form-uploads', 'form-uploads', true) 
        ON CONFLICT (id) DO NOTHING;
      `);
      
      await sequelize.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_policies 
            WHERE schemaname = 'storage' 
            AND tablename = 'objects' 
            AND policyname = 'Allow public uploads to form-uploads'
          ) THEN
            CREATE POLICY "Allow public uploads to form-uploads" ON storage.objects FOR INSERT TO public WITH CHECK (bucket_id = 'form-uploads');
          END IF;
        END
        $$;
      `);
      console.log('✅ Storage bucket auto-initialized');
    } catch (err) {
      console.log('⚠️ Could not auto-initialize storage bucket (ignore if not using Supabase storage or missing permissions)', err.message);
    }

    app.listen(env.app.port, async () => {
      console.log(`🚀 Server running on http://localhost:${env.app.port}`);
      console.log(`📚 API Health: http://localhost:${env.app.port}/api/health`);
      // Start cron scheduler after server is listening
      await SchedulerService.start();
    });
  } catch (error) {
    console.error('Database connection failed:', error);
    process.exit(1);
  }
};

startServer();
