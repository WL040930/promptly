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
};
