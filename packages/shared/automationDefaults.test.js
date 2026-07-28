import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_AUTOMATION_NAME } from './automationDefaults.js';

test('uses one default title for newly created automations', () => {
    assert.equal(DEFAULT_AUTOMATION_NAME, 'New Automation');
});
