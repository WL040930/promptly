import test from 'node:test';
import assert from 'node:assert/strict';
import * as models from './index.js';

test('clean schema exposes exactly the 21 product tables', () => {
    const tables = Object.values(models)
        .filter(model => typeof model?.getTableName === 'function')
        .map(model => model.getTableName())
        .sort();
    assert.deepEqual(tables, [
        'agent_runs',
        'assistant_messages',
        'assistant_threads',
        'automation_revisions',
        'automation_runs',
        'automations',
        'connections',
        'dashboard_run_metrics',
        'database_change_events',
        'email_deliveries',
        'form_responses',
        'forms',
        'knowledge_bases',
        'knowledge_chunks',
        'knowledge_documents',
        'trigger_events',
        'trigger_subscriptions',
        'users',
        'workflow_assets',
        'workflow_continuations',
        'workflow_trigger_bindings'
    ]);
});
