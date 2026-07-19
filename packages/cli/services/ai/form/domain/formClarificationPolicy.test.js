import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluatePlannerOutcome } from './formClarificationPolicy.js';

test('decide_everything converts ordinary clarification into an internal defaults resolution', () => {
    const decision = evaluatePlannerOutcome({
        clarificationMode: 'decide_everything',
        plannerResult: {
            type: 'message',
            message: 'Please specify the section title and position.',
            inputs: [{ id: 'heading', type: 'text', label: 'Section heading text' }]
        }
    });

    assert.deepEqual(decision, {
        action: 'resolve_defaults',
        reason: 'defaultable_details'
    });
});
