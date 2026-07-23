import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureDatabaseSchema } from './schema.js';

test('ensureDatabaseSchema configures only required extensions and unified assistant scope', async () => {
    const queries = [];
    const sequelize = {
        query: async sql => queries.push(sql)
    };

    await ensureDatabaseSchema(sequelize);

    assert.equal(queries.length, 3);
    assert.match(queries[0], /CREATE EXTENSION IF NOT EXISTS vector/);
    assert.match(queries[1], /knowledge_chunks/);
    assert.match(queries[2], /assistant_threads_surface_scope/);
});
