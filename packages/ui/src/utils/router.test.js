import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPath, parsePath } from './router.js';

test('canonical workspace routes keep AI and visual editing on one automation', () => {
    assert.deepEqual(parsePath('/app/automations/auto_1/build?editor=ai'), { page: 'automation-build', automationId: 'auto_1', editor: 'ai' });
    assert.deepEqual(parsePath('/app/automations/auto_1/build?editor=visual'), { page: 'automation-build', automationId: 'auto_1', editor: 'visual' });
    assert.equal(buildPath({ page: 'automation-build', automationId: 'auto_1', editor: 'visual' }), '/app/automations/auto_1/build?editor=visual');
    assert.equal(buildPath({ page: 'automation-build', automationId: 'auto_1', editor: 'ai', prompt: 'Send a follow-up' }), '/app/automations/auto_1/build?editor=ai&prompt=Send+a+follow-up');
});

test('canonical workspace routes cover resources and onboarding', () => {
    assert.deepEqual(parsePath('/app/home'), { page: 'home' });
    assert.deepEqual(parsePath('/app/forms/form_1/responses'), { page: 'form-detail', formId: 'form_1', section: 'responses' });
    assert.deepEqual(parsePath('/app/runs/run_1'), { page: 'run-detail', runId: 'run_1' });
    assert.deepEqual(parsePath('/app/automations/new?method=visual'), { page: 'automation-new', method: 'visual' });
    assert.deepEqual(parsePath('/app/automations/new?method=ai&prompt=Follow+up'), { page: 'automation-new', method: 'ai', prompt: 'Follow up' });
    assert.equal(buildPath({ page: 'settings', section: 'connections' }), '/app/settings/connections');
});
