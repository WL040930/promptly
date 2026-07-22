import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureDatabaseSchema } from './schema.js';

test('ensureDatabaseSchema adds the form chat error metadata column idempotently', async () => {
    const queries = [];
    const sequelize = {
        query: async sql => queries.push(sql)
    };

    await ensureDatabaseSchema(sequelize);

    assert.equal(queries.length, 4);
    assert.match(queries[0], /ALTER TABLE\s+"form_chat_messages"/);
    assert.match(queries[0], /ADD COLUMN IF NOT EXISTS\s+"errorMetadata" JSONB/);
    assert.match(queries[2], /knowledge_chunks/);
    assert.match(queries[3], /agent_runs_sessionId_fkey/);
    assert.match(queries[3], /conversation_messages_sessionId_fkey/);
    assert.match(queries[3], /ON DELETE CASCADE/);
});
