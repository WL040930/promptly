import assert from 'node:assert/strict';
import test from 'node:test';
import { workflowAssistantInternals } from './workflowAssistant.js';

const { formIdForWorkflowNodes, normalizeWorkflowCommand, resolveWorkflowTurnContext, publicState } = workflowAssistantInternals;

test('workflow history state includes the latest progress after a refresh', () => {
    const result = publicState({
        workflowId: 'workflow_1',
        version: 2,
        phase: 'processing',
        progress: { status: 'checking', message: 'Checking the workflow proposal…', updatedAt: '2026-07-27T10:00:00.000Z' }
    });

    assert.equal(result.progress.message, 'Checking the workflow proposal…');
});

test('proposal validation resolves a form from a newly proposed form trigger', () => {
    assert.equal(formIdForWorkflowNodes([]), null);
    assert.equal(formIdForWorkflowNodes([{
        id: 'trigger_new',
        subType: 'form-submission',
        config: { formId: 'form_respondent' }
    }]), 'form_respondent');
});

// ---------------------------------------------------------------------------
// normalizeWorkflowCommand
// ---------------------------------------------------------------------------

test('normalizeWorkflowCommand passes through a decide_for_me command object', () => {
    const result = normalizeWorkflowCommand({ command: { type: 'decide_for_me', clarificationId: 'clar_1' }, text: '' });
    assert.equal(result.type, 'decide_for_me');
    assert.equal(result.clarificationId, 'clar_1');
});

test('normalizeWorkflowCommand detects decide phrases in free text', () => {
    for (const phrase of ['you decide', 'Decide for me', 'use sensible defaults', 'Use defaults']) {
        const result = normalizeWorkflowCommand({ command: null, text: phrase });
        assert.equal(result.type, 'decide_for_me', `Expected decide_for_me for: "${phrase}"`);
    }
});

test('normalizeWorkflowCommand returns submit_text for ordinary messages', () => {
    const result = normalizeWorkflowCommand({ command: null, text: '  add an email step  ' });
    assert.equal(result.type, 'submit_text');
    assert.equal(result.text, 'add an email step');
});

test('normalizeWorkflowCommand returns empty submit_text when no input is given', () => {
    const result = normalizeWorkflowCommand({ command: null, text: '' });
    assert.equal(result.type, 'submit_text');
    assert.equal(result.text, '');
});

test('normalizeWorkflowCommand accepts a legacy string command fallback', () => {
    const result = normalizeWorkflowCommand({ command: 'add a step', text: '' });
    assert.equal(result.type, 'submit_text');
    assert.equal(result.text, 'add a step');
});

// ---------------------------------------------------------------------------
// resolveWorkflowTurnContext
// ---------------------------------------------------------------------------

test('resolveWorkflowTurnContext marks authority as assistant for decide_for_me', () => {
    const ctx = resolveWorkflowTurnContext({
        command: { type: 'decide_for_me', clarificationId: 'clar_1' },
        activeWork: { sourceText: 'Add a Slack step', requestId: 'req_1', updatedAt: new Date().toISOString() }
    });
    assert.equal(ctx.intent.authority, 'assistant');
    assert.equal(ctx.intent.sourceText, 'Add a Slack step');
    assert.equal(ctx.command.type, 'decide_for_me');
    assert.equal(ctx.command.clarificationId, 'clar_1');
});

test('resolveWorkflowTurnContext marks relation as revise when a pending proposal exists', () => {
    const pending = { id: 'msg_1', kind: 'workflow_proposal', proposalStatus: 'pending', payload: {} };
    const ctx = resolveWorkflowTurnContext({
        command: { type: 'submit_text', text: 'also add a delay step' },
        pendingProposal: pending
    });
    assert.equal(ctx.intent.relationToPending, 'revise');
    assert.equal(ctx.pendingProposal.mode, 'include');
});

test('resolveWorkflowTurnContext marks relation as replace on correction language', () => {
    const pending = { id: 'msg_1', kind: 'workflow_proposal', proposalStatus: 'pending', payload: {} };
    const ctx = resolveWorkflowTurnContext({
        command: { type: 'submit_text', text: 'actually, use a webhook trigger instead' },
        pendingProposal: pending
    });
    assert.equal(ctx.intent.relationToPending, 'replace');
    assert.equal(ctx.pendingProposal.mode, 'exclude');
});

test('resolveWorkflowTurnContext marks relation as none when no proposal is pending', () => {
    const ctx = resolveWorkflowTurnContext({
        command: { type: 'submit_text', text: 'add a Gmail step' },
        pendingProposal: null
    });
    assert.equal(ctx.intent.relationToPending, 'none');
    assert.equal(ctx.intent.authority, 'user');
});
