import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureDatabaseSchema } from './schema.js';

test('ensureDatabaseSchema configures only PostgreSQL-specific schema requirements', async () => {
    const queries = [];
    const sequelize = {
        query: async sql => queries.push(sql)
    };

    await ensureDatabaseSchema(sequelize);

    assert.equal(queries.length, 6);
    assert.match(queries[0], /CREATE EXTENSION IF NOT EXISTS pg_trgm/);
    assert.match(queries[1], /automation_runs.*definitionSnapshot/i);
    assert.match(queries[2], /assistant_threads_surface_scope/);
    assert.match(queries[3], /automations_name_trgm/);
    assert.match(queries[4], /automation_runs_trigger_trgm/);
    assert.match(queries[5], /automation_runs_error_trgm/);
});
