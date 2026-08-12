import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeFormAIResult, runFormTurn } from '../formAIService.js';

test('normalizeFormAIResult exposes conversational outcomes through one shared seam', () => {
    assert.equal(normalizeFormAIResult({ type: 'reply', message: 'Here is an explanation.' }).kind, 'reply');
    assert.equal(normalizeFormAIResult({ type: 'message', message: 'Which audience?', inputs: [] }).kind, 'clarification');
    assert.equal(normalizeFormAIResult({ type: 'proposal', schema: {}, patches: [] }).kind, 'proposal');
});

test('runFormTurn forwards pending proposal context without applying it', async () => {
    let plannerContext = '';
    const result = await runFormTurn({
        request: 'Make the name optional.',
        currentSchema: { title: 'Survey', description: '', settings: {}, fields: [] },
        pendingProposal: {
            patches: [{ op: 'add', field: { id: 'name', type: 'text', label: 'Name' } }],
            requirements: [{ id: 'req_1', description: 'Collect the respondent name.' }]
        },
        provider: {
            async generateContent(contents) {
                plannerContext = contents[0].parts[0].text;
                return { text: JSON.stringify({ type: 'reply', message: 'I can revise that draft.' }) };
            }
        }
    });

    assert.equal(result.kind, 'reply');
    assert.match(plannerContext, /Pending Proposal:/);
    assert.match(plannerContext, /Collect the respondent name/);
});

test('runFormTurn revises draft-only pending fields into an applyable saved-form proposal', async () => {
    const currentSchema = {
        id: 'form_1',
        title: 'Contact Form',
        description: '',
        settings: {},
        fields: [
            { id: 'name', type: 'text', label: 'Name' },
            { id: 'email', type: 'email', label: 'Email', required: true },
            { id: 'message', type: 'textarea', label: 'Message' }
        ]
    };
    const pendingProposal = {
        messageId: 'proposal_1',
        patches: [
            { op: 'add', field: { id: 'f_phone_1', type: 'phone', label: 'Phone' } },
            { op: 'add', field: { id: 'f_company_1', type: 'text', label: 'Company' } },
            { op: 'add', field: { id: 'f_job_title_1', type: 'text', label: 'Job Title' } }
        ]
    };
    const provider = {
        async generateContent(_contents, options) {
            if (options.operation === 'form:planner') return { text: JSON.stringify({
                type: 'plan_complete',
                summary: 'Remove Company from the pending draft.',
                requirements: [{ id: 'req_remove_company', description: 'Do not include the Company field in the proposed form.' }],
                memoryUpdate: { action: 'none' }
            }) };
            if (options.operation === 'form:worker') return { text: JSON.stringify({
                patches: [{ op: 'remove', id: 'f_company_1' }]
            }) };
            assert.equal(options.operation, 'form:verifier');
            return { text: JSON.stringify({ status: 'pass', issues: [] }) };
        }
    };

    const result = await runFormTurn({
        request: 'dont need the company',
        currentSchema,
        pendingProposal,
        provider
    });

    assert.equal(result.kind, 'proposal');
    assert.equal(result.revisesProposalMessageId, 'proposal_1');
    assert.deepEqual(result.schema.fields.map(field => field.id), ['name', 'email', 'message', 'f_phone_1', 'f_job_title_1']);
    assert.deepEqual(result.patches.map(patch => [patch.op, patch.field?.id || patch.id]), [
        ['add', 'f_phone_1'],
        ['add', 'f_job_title_1']
    ]);
});

test('runFormTurn invalidates a pending draft that was created from an older saved form', async () => {
    let providerCalls = 0;
    const result = await runFormTurn({
        request: 'dont need the company',
        currentSchema: { title: 'Contact Form', description: '', settings: {}, fields: [], updatedAt: '2026-08-13T01:00:00.000Z' },
        pendingProposal: {
            messageId: 'proposal_1',
            baseFormUpdatedAt: '2026-08-13T00:00:00.000Z',
            patches: []
        },
        provider: {
            async generateContent() {
                providerCalls += 1;
                throw new Error('The provider must not be called for a stale pending proposal.');
            }
        }
    });

    assert.equal(result.kind, 'reply');
    assert.equal(result.pendingProposalDisposition, 'stale');
    assert.equal(providerCalls, 0);
});
