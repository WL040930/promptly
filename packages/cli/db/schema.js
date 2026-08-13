/**
 * Apply PostgreSQL-only schema pieces that Sequelize model sync cannot
 * express. Ordinary columns and B-tree indexes belong to their models, so a
 * fresh `sequelize.sync()` creates them as part of the clean schema.
 */
export const ensureDatabaseSchema = async (sequelize) => {
    await sequelize.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm;`);
    await sequelize.query(`
        DO $$
        BEGIN
            IF to_regclass('public.assistant_threads') IS NOT NULL THEN
                ALTER TABLE "assistant_threads"
                    DROP CONSTRAINT IF EXISTS "assistant_threads_surface_scope";
                ALTER TABLE "assistant_threads"
                    ADD CONSTRAINT "assistant_threads_surface_scope"
                    CHECK (
                        ("surface" = 'ask_promptly' AND "formId" IS NULL AND "workflowId" IS NULL)
                        OR ("surface" = 'form' AND "formId" IS NOT NULL AND "workflowId" IS NULL)
                        OR ("surface" = 'workflow' AND "formId" IS NULL AND "workflowId" IS NOT NULL)
                    );
            END IF;
        END
        $$;
    `);
    // The logs search endpoint supports substring matching. Sequelize cannot
    // define a PostgreSQL GIN/trigram index, so those stay here.
    await sequelize.query(`
        CREATE INDEX IF NOT EXISTS "automations_name_trgm"
        ON "automations" USING gin (name gin_trgm_ops);
    `);
    await sequelize.query(`
        CREATE INDEX IF NOT EXISTS "automation_runs_trigger_trgm"
        ON "automation_runs" USING gin (trigger gin_trgm_ops);
    `);
    await sequelize.query(`
        CREATE INDEX IF NOT EXISTS "automation_runs_error_trgm"
        ON "automation_runs" USING gin (error gin_trgm_ops);
    `);
    await sequelize.query(`
        CREATE INDEX IF NOT EXISTS "automation_runs_workflow_name_trgm"
        ON "automation_runs" USING gin ("workflowNameSnapshot" gin_trgm_ops);
    `);
};
