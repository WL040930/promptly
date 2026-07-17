import test from 'node:test';
import assert from 'node:assert/strict';
import { makeIntent, makePlan } from './agentContracts.js';
import { shouldPauseForPlanReview, shouldUseAgenticPath } from './agentOrchestrator.js';

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

    const plan = makePlan({ summary: 'Review', steps: [{ id: 'one', type: 'design_form' }] }, intent);
    assert.equal(plan.steps[0].status, 'pending');
    assert.equal(plan.approvalRequired, true);
});

test('agentic path is reserved for build or change requests with a domain', () => {
    assert.equal(shouldUseAgenticPath('Show me my workflows'), false);
    assert.equal(shouldUseAgenticPath('Create a customer feedback form and workflow'), true);
    assert.equal(shouldUseAgenticPath('Modify the onboarding workflow'), true);
});

test('agent pauses for an explicit plan review request', () => {
    assert.equal(shouldPauseForPlanReview('Create the form, but show me the plan first.'), true);
    assert.equal(shouldPauseForPlanReview('Create the form and proceed.'), false);
    assert.equal(shouldUseAgenticPath('Show me the plan for this workflow before proceeding'), true);
});
