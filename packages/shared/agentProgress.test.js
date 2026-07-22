import test from 'node:test';
import assert from 'node:assert/strict';
import { getAgentProgressLabel } from './agentProgress.js';

test('agent progress labels describe workflow stages instead of raw event names', () => {
    assert.equal(getAgentProgressLabel({ type: 'workflow.design.progress', stage: 'assemble' }), 'Configuring the workflow steps');
    assert.equal(getAgentProgressLabel({ type: 'step.started', step: 'research' }), 'Checking your workspace');
    assert.equal(getAgentProgressLabel({ type: 'step.started', step: { type: 'design_workflow' } }), 'Building the workflow');
    assert.equal(getAgentProgressLabel({ type: 'approval.required' }), 'Waiting for your approval');
});
