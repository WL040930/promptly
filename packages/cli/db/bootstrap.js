import sequelize from './index.js';
import '../models/index.js';
import { ensureDatabaseSchema } from './schema.js';
import { ensureStorageResources } from './storageProvisioning.js';
import { ensureDatabaseChangeTriggers } from '../services/triggers/databaseTriggerService.js';
import { fileURLToPath } from 'node:url';

const removeDuplicateAssetConstraint = async () => {
    await sequelize.query(`
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM pg_constraint
                WHERE conname = 'workflow_assets_storageKey_key1'
                  AND conrelid = 'workflow_assets'::regclass
            ) THEN
                ALTER TABLE "workflow_assets"
                DROP CONSTRAINT "workflow_assets_storageKey_key1";
            END IF;
        END
        $$;
    `);
};

const modelTableNames = () => [...new Set(
    Object.values(sequelize.models)
        .map(model => model.getTableName())
        .map(table => typeof table === 'string' ? table : table.tableName)
        .filter(Boolean)
)];

const hasMissingModelTables = async () => {
    const existingTables = new Set((await sequelize.getQueryInterface().showAllTables())
        .map(table => typeof table === 'string' ? table : table.tableName));
    return modelTableNames().some(table => !existingTables.has(table));
};

const needsPostgresSetup = async () => {
    const [rows] = await sequelize.query(`
        SELECT
            EXISTS (
                SELECT 1 FROM pg_constraint
                WHERE conname = 'assistant_threads_surface_scope'
                  AND conrelid = 'assistant_threads'::regclass
            ) AS assistant_scope_ready,
            to_regprocedure('promptly_record_database_change()') IS NOT NULL AS change_function_ready,
            EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') AS trigram_ready,
            (SELECT COUNT(*) FROM pg_trigger
                WHERE tgname IN (
                    'promptly_forms_change',
                    'promptly_automations_change',
                    'promptly_automation_runs_change'
                )
                AND NOT tgisinternal) = 3 AS change_triggers_ready,
            to_regclass('public.automations_name_trgm') IS NOT NULL
                AND to_regclass('public.automation_runs_trigger_trgm') IS NOT NULL
                AND to_regclass('public.automation_runs_error_trgm') IS NOT NULL
                AS trigram_indexes_ready,
            EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = 'automation_runs'
                  AND column_name = 'definitionSnapshot'
            ) AS automation_run_snapshot_ready,
            NOT EXISTS (
                SELECT 1 FROM pg_constraint
                WHERE conname = 'workflow_assets_storageKey_key1'
                  AND conrelid = 'workflow_assets'::regclass
            ) AS asset_constraint_ready;
    `);
    const state = rows[0];
    return !Object.values(state).every(Boolean);
};

export const ensureDatabaseReady = async () => {
    await sequelize.authenticate();
    const modelTablesMissing = await hasMissingModelTables();
    const postgresSetupMissing = modelTablesMissing || await needsPostgresSetup();
    if (!modelTablesMissing && !postgresSetupMissing) {
        console.log('[DB] Schema already initialized; skipping bootstrap.');
        return;
    }

    // This is invoked after a reset. Normal application startup intentionally
    // does not create or alter schema.
    if (modelTablesMissing) await sequelize.sync();
    if (postgresSetupMissing) {
        await ensureDatabaseSchema(sequelize);
        await ensureDatabaseChangeTriggers(sequelize);
        await ensureStorageResources(sequelize);
        await removeDuplicateAssetConstraint();
    }
    console.log('[DB] Bootstrap complete.');
};

const isDirectInvocation = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isDirectInvocation) {
    ensureDatabaseReady()
        .catch(error => {
            console.error('[DB] Bootstrap failed:', error.message);
            process.exitCode = 1;
        })
        .finally(async () => {
            await sequelize.close();
        });
}
