import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileAskPromptlyTurnMessages } from './askPromptlyMessageReconciliation.js';

test('Ask Promptly replaces the answered clarification before appending the proposal', () => {
    const messages = [{
        id: 'clarification_1',
        sender: 'bot',
        kind: 'clarification',
        payload: {
            options: [{ id: 'form-target', type: 'form_choice', options: [{ id: 'form_1', title: 'Contact Us' }] }]
        }
    }];
    const result = reconcileAskPromptlyTurnMessages(messages, {
        clarification: {
            id: 'clarification_1',
            sender: 'bot',
            kind: 'clarification',
            payload: {
                selectedState: { 'form-target': 'form_1' },
                resolution: { type: 'answered', answers: [{ label: 'Choose a form', answer: 'Contact Us' }] }
            }
        },
        reply: { id: 'proposal_1', sender: 'bot', kind: 'solution_proposal', text: 'Ready.' }
    });

    assert.equal(result.length, 2);
    assert.equal(result[0].payload.resolution.type, 'answered');
    assert.equal(result[1].kind, 'solution_proposal');
});
