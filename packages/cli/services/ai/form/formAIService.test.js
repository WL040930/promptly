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
