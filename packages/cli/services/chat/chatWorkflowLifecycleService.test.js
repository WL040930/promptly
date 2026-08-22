import test from 'node:test';
import assert from 'node:assert/strict';
import {
    assertWorkflowLifecycleExpectation,
    describeWorkflowLifecycleAction,
    workflowLifecycleExpectation
} from '../automations/workflowLifecycleService.js';
import { workflowLifecycleInternals } from './chatWorkflowLifecycleService.js';

const workflow = ({ active = false, publishedRevisionId = null, trigger = 'webhook' } = {}) => ({
    id: 'workflow_1',
    name: 'Respond to feedback',
    revision: 7,
    isActive: active,
    publishedRevisionId,
    nodes: [{ id: 'trigger_1', type: 'trigger', subType: trigger }],
    edges: []
});

test('lifecycle descriptions capture the draft or release that approval is based on', () => {
    const publish = describeWorkflowLifecycleAction({ workflow: workflow(), action: 'publish' });
    assert.equal(publish.action, 'publish');
    assert.deepEqual(publish.expected, { draftRevision: 7 });
    assert.equal(publish.requiresPayload, false);

    const live = describeWorkflowLifecycleAction({
        workflow: workflow({ active: true, publishedRevisionId: 'release_3', trigger: 'schedule' }),
        action: 'live_run'
    });
    assert.deepEqual(live.expected, { publishedRevisionId: 'release_3', isActive: true });
    assert.equal(live.requiresPayload, false);
});

test('lifecycle descriptions require a live release for pause and live run', () => {
    assert.throws(
        () => describeWorkflowLifecycleAction({ workflow: workflow(), action: 'pause' }),
        error => error.code === 'WORKFLOW_NOT_ACTIVE'
    );
    assert.throws(
        () => describeWorkflowLifecycleAction({ workflow: workflow(), action: 'live_run' }),
        error => error.code === 'WORKFLOW_NOT_LIVE'
    );
});

test('lifecycle approvals fail closed when the reviewed state is stale', () => {
    assert.throws(
        () => assertWorkflowLifecycleExpectation(workflow(), { draftRevision: 8 }),
        error => error.code === 'WORKFLOW_LIFECYCLE_STALE'
    );
    assert.deepEqual(workflowLifecycleExpectation(workflow({ active: true, publishedRevisionId: 'release_3' }), 'pause'), {
        publishedRevisionId: 'release_3',
        isActive: true
    });
});

test('run payload parsing accepts objects and rejects invalid JSON or arrays', () => {
    assert.deepEqual(workflowLifecycleInternals.parsePayload('{"rating":2}'), { rating: 2 });
    assert.throws(
        () => workflowLifecycleInternals.parsePayload('{bad'),
        error => error.code === 'WORKFLOW_LIFECYCLE_PAYLOAD_INVALID'
    );
    assert.throws(
        () => workflowLifecycleInternals.parsePayload([]),
        error => error.code === 'WORKFLOW_LIFECYCLE_PAYLOAD_INVALID'
    );
});

