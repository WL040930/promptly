import test from 'node:test';
import assert from 'node:assert/strict';
import { findResourceCandidates, mergeAgentContext, resolveResource } from './resourceResolver.js';

const rows = {
    Workflow: [
        { id: 'w_1', name: 'Testing Workflow', updatedAt: '2026-07-17T10:00:00.000Z' },
        { id: 'w_2', name: 'Customer Follow Up', updatedAt: '2026-07-16T10:00:00.000Z' }
    ],
    Form: [
        { id: 'form_1', title: 'Customer Survey', updatedAt: '2026-07-17T10:00:00.000Z' }
    ]
};

const models = Object.fromEntries(Object.entries(rows).map(([key, values]) => [key, {
    findAll: async () => values,
    findOne: async ({ where }) => values.find(row => row.id === where.id) || null
}]));

test('findResourceCandidates matches workflow names without returning full definitions', async () => {
    const candidates = await findResourceCandidates({ userId: 'user_1', type: 'workflow', reference: 'testing' , models });
    assert.deepEqual(candidates.map(candidate => candidate.id), ['w_1']);
    assert.deepEqual(Object.keys(candidates[0]).sort(), ['id', 'name', 'updatedAt']);
});

test('resolveResource prefers the selected resource for follow-up messages', async () => {
    const result = await resolveResource({ userId: 'user_1', type: 'workflow', selectedId: 'w_2', reference: 'testing', models });
    assert.equal(result.status, 'resolved');
    assert.equal(result.source, 'selected');
    assert.equal(result.resource.id, 'w_2');
});

test('resolveResource reports ambiguous references instead of guessing', async () => {
    const result = await resolveResource({ userId: 'user_1', type: 'workflow', reference: '', models });
    assert.equal(result.status, 'ambiguous');
    assert.equal(result.candidates.length, 2);
});

test('resolveResource reports a missing reference clearly', async () => {
    const result = await resolveResource({ userId: 'user_1', type: 'form', reference: 'Unknown Form', models });
    assert.equal(result.status, 'not_found');
    assert.deepEqual(result.candidates, []);
});

test('mergeAgentContext preserves stored selection and accepts new UI selection', () => {
    assert.deepEqual(
        mergeAgentContext({ workflowId: 'w_1', formId: 'form_1' }, { workflowId: 'w_2' }),
        { workflowId: 'w_2', formId: 'form_1' }
    );
});

test('mergeAgentContext clears a target when the UI explicitly sends null', () => {
    assert.deepEqual(
        mergeAgentContext({ workflowId: 'w_1', formId: 'form_1' }, { workflowId: null, formId: null }),
        { workflowId: null, formId: null }
    );
});

test('mergeAgentContext stores a supported clarification mode and normalizes invalid values', () => {
    assert.equal(
        mergeAgentContext({}, { clarificationMode: 'ask_everything' }).clarificationMode,
        'ask_everything'
    );
    assert.equal(
        mergeAgentContext({}, { clarificationMode: 'unsupported' }).clarificationMode,
        'important_only'
    );
});
