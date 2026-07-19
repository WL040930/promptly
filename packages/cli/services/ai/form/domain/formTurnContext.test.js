import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveFormTurnContext } from './formTurnContext.js';

test('resolves a decide-for-me answer against the active section-heading work', () => {
    const result = resolveFormTurnContext({
        command: { type: 'submit_text', text: 'u decide' },
        clarification: {
            id: 'clarification_1',
            workId: 'work_1',
            questions: [{ id: 'heading', type: 'text', label: 'Section heading text' }]
        },
        activeWork: {
            id: 'work_1',
            sourceText: 'I mean section heading',
            scope: 'heading_only'
        },
        pendingProposal: {
            messageId: 'proposal_1',
            patches: [{ op: 'add', field: { type: 'text', label: 'Meal Preference' } }]
        }
    });

    assert.deepEqual(result.command, {
        type: 'decide_for_me',
        clarificationId: 'clarification_1'
    });
    assert.equal(result.intent.scope, 'heading_only');
    assert.equal(result.intent.relationToPending, 'replace');
    assert.equal(result.intent.sourceText, 'I mean section heading');
    assert.equal(result.pendingProposal.mode, 'exclude');
});
