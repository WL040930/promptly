/**
 * Apply additive database changes that cannot be handled by Sequelize's
 * default `sync()` call. Keep these statements idempotent so existing
 * installations can start safely after a model gains a new nullable field.
 */
export const ensureDatabaseSchema = async (sequelize) => {
    await sequelize.query(`
        ALTER TABLE "form_chat_messages"
        ADD COLUMN IF NOT EXISTS "errorMetadata" JSONB;
    `);
    await sequelize.query(`CREATE EXTENSION IF NOT EXISTS vector;`).catch(error => {
        console.warn('[DB] pgvector extension is unavailable; knowledge-base search will remain disabled.', error.message);
    });
    await sequelize.query(`
        ALTER TABLE "knowledge_chunks"
        ADD COLUMN IF NOT EXISTS "embedding" vector(1536);
    `).catch(() => {});

    // `sequelize.sync()` does not update the delete action of an existing
    // foreign key. Older installations therefore retained NO ACTION/SET NULL
    // constraints even though the model associations request CASCADE. Keep
    // these constraints aligned so deleting a conversation also removes its
    // messages and agent runs instead of returning a misleading 409 conflict.
    await sequelize.query(`
        DO $$
        BEGIN
            IF to_regclass('public.conversations') IS NOT NULL
                AND to_regclass('public.agent_runs') IS NOT NULL THEN
                IF NOT EXISTS (
                    SELECT 1
                    FROM pg_constraint
                    WHERE conname = 'agent_runs_sessionId_fkey'
                        AND contype = 'f'
                        AND confdeltype = 'c'
                ) THEN
                    ALTER TABLE "agent_runs"
                        DROP CONSTRAINT IF EXISTS "agent_runs_sessionId_fkey";
                    ALTER TABLE "agent_runs"
                        ADD CONSTRAINT "agent_runs_sessionId_fkey"
                        FOREIGN KEY ("sessionId") REFERENCES "conversations" ("id")
                        ON DELETE CASCADE;
                END IF;
            END IF;

            IF to_regclass('public.conversations') IS NOT NULL
                AND to_regclass('public.conversation_messages') IS NOT NULL THEN
                IF NOT EXISTS (
                    SELECT 1
                    FROM pg_constraint
                    WHERE conname = 'conversation_messages_sessionId_fkey'
                        AND contype = 'f'
                        AND confdeltype = 'c'
                ) THEN
                    ALTER TABLE "conversation_messages"
                        DROP CONSTRAINT IF EXISTS "conversation_messages_sessionId_fkey";
                    ALTER TABLE "conversation_messages"
                        ADD CONSTRAINT "conversation_messages_sessionId_fkey"
                        FOREIGN KEY ("sessionId") REFERENCES "conversations" ("id")
                        ON DELETE CASCADE;
                END IF;
            END IF;
        END
        $$;
    `);
};
