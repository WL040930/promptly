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
    assert.match(queries[1], /assistant_threads_surface_scope/);
    assert.match(queries[2], /automations_name_trgm/);
    assert.match(queries[3], /automation_runs_trigger_trgm/);
    assert.match(queries[4], /automation_runs_error_trgm/);
    assert.match(queries[5], /automation_runs_workflow_name_trgm/);
});
