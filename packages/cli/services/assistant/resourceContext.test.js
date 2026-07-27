import assert from 'node:assert/strict';
import test from 'node:test';
import { applyResourceContextDelta, buildResourceIdentity, resourceContextForPrompt } from './resourceContext.js';

test('resource context keeps accepted decisions attached to one form', () => {
    const identity = buildResourceIdentity({ surface: 'form', resource: { title: 'Customer Satisfaction Form', description: 'Collect customer feedback', updatedAt: '2026-01-01T00:00:00.000Z' } });
    const context = applyResourceContextDelta({
        context: {},
        identity,
        delta: {
            set: { purpose: 'Measure satisfaction after a purchase', audience: 'Existing customers' },
            addInvariants: ['Keep the form focused on customer satisfaction'],
            addDecisions: ['Use a 1-5 satisfaction rating']
        }
    });

    assert.equal(context.resourceBrief.purpose, 'Measure satisfaction after a purchase');
    assert.deepEqual(context.resourceBrief.acceptedDecisions, ['Use a 1-5 satisfaction rating']);
    assert.deepEqual(resourceContextForPrompt({ identity, context }).identity.name, 'Customer Satisfaction Form');
});

test('resource context only removes explicitly named decisions', () => {
    const context = applyResourceContextDelta({
        context: { resourceBrief: { purpose: 'Customer feedback', invariants: ['Keep it short'], acceptedDecisions: ['Ask for a rating', 'Keep email optional'] } },
        identity: { name: 'Customer Satisfaction Form', description: '', revision: 'rev_2' },
        delta: { removeDecisions: ['Ask for a rating'], addDecisions: ['Add an optional comments field'] }
    });

    assert.deepEqual(context.resourceBrief.acceptedDecisions, ['Keep email optional', 'Add an optional comments field']);
    assert.deepEqual(context.resourceBrief.invariants, ['Keep it short']);
});
