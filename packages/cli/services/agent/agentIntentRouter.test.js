import assert from 'node:assert/strict';
import test from 'node:test';
import { decideAgentIntent, MIN_INTENT_CONFIDENCE } from './agentIntentRouter.js';

const requestWith = value => async () => ({ value, tokenUsage: { totalTokens: 12 } });

test('AI decides a compound request needs both a form and workflow', async () => {
    const decision = await decideAgentIntent({
        message: 'Collect interview applications, save each response, and notify the applicant.',
        requestJson: requestWith({
            route: 'agent',
            confidence: 0.94,
            intent: {
                goal: 'create',
                domains: ['form', 'workflow'],
                requestedOperations: [
                    { domain: 'form', action: 'create', target: 'interview application form' },
                    { domain: 'workflow', action: 'create', target: 'submission response workflow' }
                ]
            }
        })
    });

    assert.equal(decision.route, 'agent');
    assert.deepEqual(decision.intent.domains, ['form', 'workflow']);
    assert.equal(decision.intent.requestedOperations[0].action, 'create');
});

test('AI domain decisions are not narrowed by keyword hints', async () => {
    const decision = await decideAgentIntent({
        message: 'Please make the process automatically notify the applicant after submission.',
        requestJson: requestWith({
            route: 'agent',
            confidence: 0.9,
            intent: {
                goal: 'create',
                domains: ['workflow'],
                requestedOperations: [{ domain: 'workflow', action: 'create', target: 'notification automation' }]
            }
        })
    });

    assert.deepEqual(decision.intent.domains, ['workflow']);
    assert.equal(decision.route, 'agent');
});

test('low-confidence intent asks one clarification question without creating a plan', async () => {
    const decision = await decideAgentIntent({
        message: 'Set this up for me.',
        requestJson: requestWith({
            route: 'agent',
            confidence: MIN_INTENT_CONFIDENCE - 0.01,
            intent: { goal: 'create', domains: ['form', 'workflow'] },
            clarification: { question: 'Should I prepare a form, a workflow, or both?' }
        })
    });

    assert.equal(decision.route, 'clarification');
    assert.equal(decision.clarification.question, 'Should I prepare a form, a workflow, or both?');
});

test('empty form-target clarification options become a usable answer field', async () => {
    const decision = await decideAgentIntent({
        message: 'Create a workflow when the form receives responses.',
        requestJson: requestWith({
            route: 'clarification',
            confidence: 0.42,
            intent: {
                goal: 'create',
                domains: ['workflow'],
                resourceReferences: [{ type: 'form', query: 'mentioned form' }]
            },
            clarification: {
                question: 'Which form should trigger the workflow?',
                options: []
            }
        })
    });

    assert.equal(decision.route, 'clarification');
    assert.deepEqual(decision.clarification.options, [{
        id: 'formId',
        type: 'text',
        label: 'Form name or ID',
        placeholder: 'Enter a form name or ID…',
        required: true
    }]);
});

test('intent provider failure returns retry guidance instead of a heuristic route', async () => {
    const decision = await decideAgentIntent({
        message: 'Build an application workflow.',
        requestJson: async () => { throw Object.assign(new Error('timeout'), { code: 'AI_TIMEOUT' }); }
    });

    assert.equal(decision.route, 'unavailable');
    assert.equal(decision.error.code, 'AI_TIMEOUT');
});
