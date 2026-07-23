/**
 * Apply database extensions and constraints that are not expressed by
 * Sequelize's model sync. The application owns a clean, resettable schema;
 * this function must not recreate retired tables.
 */
export const ensureDatabaseSchema = async (sequelize) => {
    await sequelize.query(`CREATE EXTENSION IF NOT EXISTS vector;`).catch(error => {
        console.warn('[DB] pgvector extension is unavailable; knowledge-base search will remain disabled.', error.message);
    });
    await sequelize.query(`
        ALTER TABLE "knowledge_chunks"
        ADD COLUMN IF NOT EXISTS "embedding" vector(1536);
    `).catch(() => {});
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
};
