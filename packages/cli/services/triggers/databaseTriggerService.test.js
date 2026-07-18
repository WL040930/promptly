import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesDatabaseSubscription } from './triggerContracts.js';

test('database trigger filters match the current record image', () => {
    const change = {
        resource: 'forms',
        eventType: 'updated',
        afterData: { id: 'form_1', title: 'Customer Survey' },
        beforeData: { id: 'form_1', title: 'Old title' }
    };
    assert.equal(matchesDatabaseSubscription({ config: { resource: 'forms', events: ['updated'], filters: { title: 'Customer Survey' } }, change }), true);
    assert.equal(matchesDatabaseSubscription({ config: { resource: 'forms', events: ['created'] }, change }), false);
    assert.equal(matchesDatabaseSubscription({ config: { resource: 'automations' }, change }), false);
});
