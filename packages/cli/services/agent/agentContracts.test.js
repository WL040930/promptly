import test from 'node:test';
import assert from 'node:assert/strict';
import { makeIntent } from './agentContracts.js';
import { makeAdaptivePlan } from './agentPlanCompiler.js';
import { shouldPauseForPlanReview } from './agentOrchestrator.js';

test('agent contracts normalize model output into bounded values', () => {
    const intent = makeIntent({
        goal: 'modify',
        domains: ['form', 'unsupported', 'workflow'],
        requirements: Array.from({ length: 30 }, () => 'requirement'),
        confidence: 3
    });
    assert.deepEqual(intent.domains, ['form', 'workflow']);
    assert.equal(intent.requirements.length, 20);
    assert.equal(intent.confidence, 1);

    const plan = makeAdaptivePlan({ summary: 'Review', steps: [{ id: 'one', type: 'design_form' }] }, intent);
    assert.equal(plan.steps[0].id, 'one');
    assert.equal(plan.approvalRequired, true);
});

test('agent pauses for an explicit plan review request', () => {
    assert.equal(shouldPauseForPlanReview('Create the form, but show me the plan first.'), true);
    assert.equal(shouldPauseForPlanReview('Create the form and proceed.'), false);
});
