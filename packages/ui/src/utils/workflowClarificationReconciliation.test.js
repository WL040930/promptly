import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileWorkflowClarificationAnswer } from './workflowClarificationReconciliation.js';

test('workflow clarification collapses into an answer receipt after submission', () => {
    const messages = [{
        id: 'clarification_message_1',
        sender: 'bot',
        kind: 'clarification',
        text: 'How should the AI summary be used in the alert email?',
        payload: {
            inputs: [{
                id: 'emailBodyMode',
                type: 'single_choice',
                label: 'Email body',
                options: ['Only the AI summary', 'Combine with existing text']
            }]
        }
    }];

    const result = reconcileWorkflowClarificationAnswer(messages, {
        type: 'submit_clarification',
        clarificationMessageId: 'clarification_message_1',
        state: { emailBodyMode: ['Only the AI summary'] }
    }, { now: () => new Date('2026-08-18T00:00:00.000Z') });

    assert.equal(result[0].id, 'clarification_message_1');
    assert.equal(result[0].payload.resolution.type, 'answered');
    assert.deepEqual(result[0].payload.selectedState, { emailBodyMode: ['Only the AI summary'] });
    assert.deepEqual(result[0].payload.resolution.answers, [{
        id: 'emailBodyMode',
        label: 'Email body',
        answer: 'Only the AI summary'
    }]);
});

test('workflow clarification resolution falls back to the latest pending card', () => {
    const messages = [
        { id: 'clarification_message_1', sender: 'bot', kind: 'clarification', payload: { resolution: { type: 'answered' } } },
        {
            id: 'clarification_message_2',
            sender: 'bot',
            kind: 'clarification',
            payload: { inputs: [{ id: 'tone', type: 'text', label: 'Tone' }] }
        }
    ];

    const result = reconcileWorkflowClarificationAnswer(messages, {
        type: 'submit_clarification',
        state: { tone: 'Concise' }
    }, { now: () => new Date('2026-08-18T00:00:00.000Z') });

    assert.equal(result[0].payload.resolution.type, 'answered');
    assert.equal(result[1].payload.resolution.type, 'answered');
    assert.deepEqual(result[1].payload.selectedState, { tone: 'Concise' });
});
