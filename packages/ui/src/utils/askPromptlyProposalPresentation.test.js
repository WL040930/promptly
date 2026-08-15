import test from 'node:test';
import assert from 'node:assert/strict';
import { coalesceAskPromptlyProposalMessages } from './askPromptlyProposalPresentation.js';

const coordinatorWork = {
    id: 'work_1',
    sender: 'bot',
    kind: 'assistant_work',
    payload: { work: { surface: 'ask_promptly', outcomeKind: 'proposal', status: 'awaiting_review', activities: [{ id: 'design' }] } }
};

test('Ask Promptly presents its completed work and final form review as one card', () => {
    const proposal = { id: 'proposal_1', sender: 'bot', kind: 'form_proposal', payload: { schema: { title: 'Job Application Form' }, plan: { summary: 'Create the form.' } } };

    const result = coalesceAskPromptlyProposalMessages([coordinatorWork, proposal]);

    assert.equal(result.length, 1);
    assert.equal(result[0].id, proposal.id);
    assert.equal(result[0].payload.work, coordinatorWork.payload.work);
    assert.equal(result[0].payload.plan.summary, 'Create the form.');
});

test('Ask Promptly keeps preparation details with a compound solution review', () => {
    const proposal = {
        id: 'proposal_2',
        sender: 'bot',
        kind: 'solution_proposal',
        payload: { solution: [{ id: 'form_1', type: 'form_proposal' }] }
    };

    const result = coalesceAskPromptlyProposalMessages([coordinatorWork, proposal]);

    assert.equal(result.length, 1);
    assert.equal(result[0].payload.work, coordinatorWork.payload.work);
});

test('active or specialist progress remains visible until it has its own final proposal', () => {
    const active = { ...coordinatorWork, payload: { work: { surface: 'ask_promptly', status: 'drafting' } } };
    const specialist = { ...coordinatorWork, payload: { work: { surface: 'form', outcomeKind: 'proposal' } } };

    assert.deepEqual(coalesceAskPromptlyProposalMessages([active]), [active]);
    assert.deepEqual(coalesceAskPromptlyProposalMessages([specialist]), [specialist]);
});
