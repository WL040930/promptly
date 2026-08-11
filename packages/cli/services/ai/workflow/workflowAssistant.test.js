import assert from 'node:assert/strict';
import test from 'node:test';
import { createWorkflowAssistant, workflowAssistantInternals } from './workflowAssistant.js';

const { formIdForWorkflowNodes, normalizeWorkflowCommand, resolveWorkflowTurnContext, statePatchForResult } = workflowAssistantInternals;

const createMemoryModels = () => {
    const workflows = [{ id: 'workflow_1', userId: 'user_1', name: 'Registration flow', revision: 1, nodes: [], edges: [] }];
    const forms = [];
    const messages = [];
    const threads = [];
    const instance = value => ({
        ...value,
        toJSON() { return { ...this }; },
        async update(patch) { Object.assign(value, patch); Object.assign(this, patch); return this; }
    });
    const matchesWhere = (row, where) => Object.entries(where || {}).every(([key, value]) => {
        if (value && typeof value === 'object') {
            const operator = Object.getOwnPropertySymbols(value)[0];
            if (operator?.description === 'lt') return new Date(row[key]).getTime() < new Date(value[operator]).getTime();
        }
        return row[key] === value;
    });
    const findBy = (rows, where, order = null) => {
        const matches = rows.filter(row => matchesWhere(row, where));
        if (order?.[0]) {
            const [key, direction] = order[0];
            matches.sort((left, right) => (new Date(left[key]).getTime() - new Date(right[key]).getTime()) * (direction === 'DESC' ? -1 : 1));
        }
        return matches[0];
    };
    const model = rows => ({
        async findOne({ where, order } = {}) { const row = findBy(rows, where, order); return row ? instance(row) : null; },
        async findAll({ where, order, limit } = {}) {
            const matches = rows.filter(row => matchesWhere(row, where));
            if (order?.[0]) {
                const [key, direction] = order[0];
                matches.sort((left, right) => (new Date(left[key]).getTime() - new Date(right[key]).getTime()) * (direction === 'DESC' ? -1 : 1));
            }
            return matches.slice(0, limit || matches.length).map(instance);
        },
        async create(value) { const row = instance(value); rows.push(row); return row; },
        async destroy({ where }) {
            const before = rows.length;
            for (let index = rows.length - 1; index >= 0; index -= 1) {
                if (Object.entries(where || {}).every(([key, value]) => rows[index][key] === value)) rows.splice(index, 1);
            }
            return before - rows.length;
        }
    });
    return {
        models: {
            Workflow: model(workflows),
            Form: model(forms),
            AssistantMessage: model(messages),
            AssistantThread: model(threads)
        },
        workflows,
        forms,
        messages,
        threads
    };
};

test('workflow state keeps a pending proposal through a normal reply', () => {
    const result = statePatchForResult({
        resultKind: 'text',
        command: { type: 'submit_text', text: 'Explain this proposal' },
        previousActiveProposalMessageId: 'proposal_1'
    });

    assert.equal(result.phase, 'awaiting_proposal');
    assert.equal(result.activeProposalMessageId, 'proposal_1');
});

test('workflow assistant persists a clarification and normalizes its mode', async () => {
    const memory = createMemoryModels();
    const assistant = createWorkflowAssistant({
        models: memory.models,
        db: { transaction: async callback => callback({}) },
        runTurn: async () => ({
            kind: 'clarification',
            message: 'Which email provider should I use?',
            inputs: [{ id: 'provider', type: 'single_choice', label: 'Provider', options: ['Gmail'] }]
        }),
        idFactory: (() => { let count = 0; return prefix => `${prefix}_${++count}`; })()
    });

    const result = await assistant.submitTurn({
        userId: 'user_1',
        workflowId: 'workflow_1',
        command: { type: 'submit_text', text: 'Send an email' },
        clarificationMode: 'ask_everything'
    });

    assert.equal(result.state.phase, 'awaiting_clarification');
    assert.equal(result.state.mode, 'important_only');
    assert.equal(result.botMsg.kind, 'clarification');
    assert.equal(memory.messages[1].payload.work.status, 'needs_input');
});

test('workflow assistant keeps a pending proposal after a reply and after a failure', async () => {
    const memory = createMemoryModels();
    await memory.models.AssistantThread.create({
        id: 'thread_1', userId: 'user_1', surface: 'workflow', workflowId: 'workflow_1',
        state: { version: 1, phase: 'awaiting_proposal', activeProposalMessageId: 'proposal_1' }, context: {}
    });
    await memory.models.AssistantMessage.create({
        id: 'proposal_1', threadId: 'thread_1', sender: 'bot', kind: 'workflow_proposal', proposalStatus: 'pending', text: 'Add an email step.',
        payload: { workflowId: 'workflow_1', baseWorkflowRevision: 1, nodes: [], edges: [] }
    });
    let call = 0;
    const assistant = createWorkflowAssistant({
        models: memory.models,
        db: { transaction: async callback => callback({}) },
        runTurn: async () => {
            call += 1;
            if (call === 1) return { kind: 'reply', message: 'The proposal adds an email step.' };
            const error = new Error('Provider timeout');
            error.code = 'WORKFLOW_AI_PROVIDER_TIMEOUT';
            throw error;
        },
        idFactory: (() => { let count = 0; return prefix => `${prefix}_${++count}`; })()
    });

    const reply = await assistant.submitTurn({ userId: 'user_1', workflowId: 'workflow_1', command: { type: 'submit_text', text: 'What changes?' } });
    assert.equal(reply.state.phase, 'awaiting_proposal');
    assert.equal(reply.state.activeProposalMessageId, 'proposal_1');

    const failure = await assistant.submitTurn({ userId: 'user_1', workflowId: 'workflow_1', command: { type: 'submit_text', text: 'Make it shorter' } });
    assert.equal(failure.botMsg.kind, 'error');
    assert.equal(failure.state.phase, 'awaiting_proposal');
    assert.equal(failure.state.activeProposalMessageId, 'proposal_1');
});

test('workflow history uses the oldest returned message as the cursor', async () => {
    const memory = createMemoryModels();
    await memory.models.AssistantThread.create({ id: 'thread_1', userId: 'user_1', surface: 'workflow', workflowId: 'workflow_1', state: { version: 1, phase: 'idle' }, context: {} });
    await memory.models.AssistantMessage.create({ id: 'message_1', threadId: 'thread_1', sender: 'user', text: 'First', createdAt: '2026-01-01T00:00:00.000Z' });
    await memory.models.AssistantMessage.create({ id: 'message_2', threadId: 'thread_1', sender: 'bot', text: 'Second', createdAt: '2026-01-01T00:01:00.000Z' });
    await memory.models.AssistantMessage.create({ id: 'message_3', threadId: 'thread_1', sender: 'user', text: 'Third', createdAt: '2026-01-01T00:02:00.000Z' });
    const assistant = createWorkflowAssistant({ models: memory.models, db: { transaction: async callback => callback({}) } });

    const firstPage = await assistant.getHistory({ userId: 'user_1', workflowId: 'workflow_1', limit: 2 });
    const secondPage = await assistant.getHistory({ userId: 'user_1', workflowId: 'workflow_1', limit: 2, before: firstPage.nextBefore });

    assert.deepEqual(firstPage.messages.map(message => message.id), ['message_2', 'message_3']);
    assert.equal(firstPage.nextBefore, 'message_2');
    assert.deepEqual(secondPage.messages.map(message => message.id), ['message_1']);
});

test('workflow proposal application is blocked only when setup is required', async () => {
    const memory = createMemoryModels();
    await memory.models.AssistantThread.create({
        id: 'thread_1', userId: 'user_1', surface: 'workflow', workflowId: 'workflow_1',
        state: { version: 1, phase: 'awaiting_proposal', activeProposalMessageId: 'proposal_1' }, context: {}
    });
    await memory.models.AssistantMessage.create({
        id: 'proposal_1', threadId: 'thread_1', sender: 'bot', kind: 'workflow_proposal', proposalStatus: 'pending', text: 'Create a response sheet.',
        payload: {
            workflowId: 'workflow_1',
            baseWorkflowRevision: 1,
            nodes: [],
            edges: [],
            verification: { status: 'unverified' },
            readiness: { canApply: false, issues: [{ code: 'GOOGLE_RECONNECT_REQUIRED', message: 'Reconnect Google.' }] }
        }
    });
    const assistant = createWorkflowAssistant({ models: memory.models, db: { transaction: async callback => callback({}) } });

    await assert.rejects(
        () => assistant.decideProposal({ userId: 'user_1', workflowId: 'workflow_1', proposalMessageId: 'proposal_1' }),
        error => error.code === 'WORKFLOW_PROPOSAL_SETUP_REQUIRED'
    );
    assert.equal(memory.messages[0].proposalStatus, 'pending');
});

test('a repeated apply while a Google Sheet is being provisioned does not report that the proposal is gone', async () => {
    const memory = createMemoryModels();
    await memory.models.AssistantThread.create({
        id: 'thread_1', userId: 'user_1', surface: 'workflow', workflowId: 'workflow_1',
        state: { version: 1, phase: 'awaiting_proposal', activeProposalMessageId: 'proposal_1' }, context: {}
    });
    await memory.models.AssistantMessage.create({
        id: 'proposal_1', threadId: 'thread_1', sender: 'bot', kind: 'workflow_proposal', proposalStatus: 'pending', text: 'Create a response sheet.',
        payload: {
            workflowId: 'workflow_1', baseWorkflowRevision: 1, nodes: [], edges: [],
            readiness: { canApply: true },
            resourceChanges: [{ type: 'create_google_spreadsheet', ref: 'responses_sheet', title: 'Event Registration', sheetTitle: 'Responses', headers: ['Name'] }]
        }
    });

    let releaseProvisioning;
    let provisioningStarted;
    let provisioningCalls = 0;
    const started = new Promise(resolve => { provisioningStarted = resolve; });
    const waitForRelease = new Promise(resolve => { releaseProvisioning = resolve; });
    const assistant = createWorkflowAssistant({
        models: memory.models,
        db: { transaction: async callback => callback({ LOCK: { UPDATE: 'UPDATE' } }) },
        saveDraft: async ({ nodes, edges }) => ({ automation: { ...memory.workflows[0], nodes, edges, revision: 2 } }),
        spreadsheetService: {
            createAndInitialize: async () => {
                provisioningCalls += 1;
                provisioningStarted();
                await waitForRelease;
                return { id: 'spreadsheet_1', name: 'Event Registration', range: "'Responses'!A1", webViewLink: 'https://docs.google.com/spreadsheets/d/spreadsheet_1' };
            }
        }
    });

    const firstApply = assistant.decideProposal({ userId: 'user_1', workflowId: 'workflow_1', proposalMessageId: 'proposal_1' });
    await started;
    assert.equal(memory.messages[0].proposalStatus, 'applying');

    const repeatedApply = assistant.decideProposal({ userId: 'user_1', workflowId: 'workflow_1', proposalMessageId: 'proposal_1' });
    releaseProvisioning();
    await firstApply;

    await assert.doesNotReject(repeatedApply);
    assert.equal(provisioningCalls, 1);
});

test('workflow applies a locally valid unverified proposal after user review', async () => {
    const memory = createMemoryModels();
    await memory.models.AssistantThread.create({
        id: 'thread_1', userId: 'user_1', surface: 'workflow', workflowId: 'workflow_1',
        state: { version: 1, phase: 'awaiting_proposal', activeProposalMessageId: 'proposal_1' }, context: {}
    });
    await memory.models.AssistantMessage.create({
        id: 'proposal_1', threadId: 'thread_1', sender: 'bot', kind: 'workflow_proposal', proposalStatus: 'pending', text: 'Add a manual step.',
        payload: {
            workflowId: 'workflow_1', baseWorkflowRevision: 1, nodes: [], edges: [],
            verification: { status: 'unverified' }, readiness: { canApply: true }
        }
    });
    const assistant = createWorkflowAssistant({
        models: memory.models,
        db: { transaction: async callback => callback({ LOCK: { UPDATE: 'UPDATE' } }) },
        saveDraft: async () => ({ automation: memory.workflows[0] })
    });

    const result = await assistant.decideProposal({ userId: 'user_1', workflowId: 'workflow_1', proposalMessageId: 'proposal_1' });

    assert.equal(result.message.proposalStatus, 'applied');
    assert.equal(result.state.phase, 'idle');
    assert.equal(memory.messages[0].payload.verification.status, 'unverified');
});

test('workflow progress is persisted and emitted with its retry attempt', async () => {
    const memory = createMemoryModels();
    const events = [];
    const assistant = createWorkflowAssistant({
        models: memory.models,
        db: { transaction: async callback => callback({}) },
        runTurn: async ({ onProgress }) => {
            onProgress({ status: 'working', phase: 'draft', id: 'drafting', label: 'Drafting workflow changes', detail: 'Attempt 2 of 4.', attempt: 2 });
            return { kind: 'reply', message: 'Done.' };
        }
    });

    await assistant.submitTurn({
        userId: 'user_1', workflowId: 'workflow_1', command: { type: 'submit_text', text: 'Add a delay.' },
        onProgress: event => events.push(event)
    });

    assert.equal(events[0].id, 'turn:started');
    assert.equal(events.at(-1).attempt, 2);
    assert.equal(events.at(-1).work.activities.at(-1).attempt, 2);
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
    const result = normalizeWorkflowCommand({ type: 'decide_for_me', clarificationId: 'clar_1' });
    assert.equal(result.type, 'decide_for_me');
    assert.equal(result.clarificationId, 'clar_1');
});

test('normalizeWorkflowCommand preserves text commands for the turn context to interpret', () => {
    for (const phrase of ['you decide', 'Decide for me', 'use sensible defaults', 'Use defaults']) {
        const result = normalizeWorkflowCommand({ type: 'submit_text', text: phrase });
        assert.equal(result.type, 'submit_text');
        assert.equal(result.text, phrase);
    }
});

test('normalizeWorkflowCommand returns submit_text for ordinary messages', () => {
    const result = normalizeWorkflowCommand({ type: 'submit_text', text: '  add an email step  ' });
    assert.equal(result.type, 'submit_text');
    assert.equal(result.text, 'add an email step');
});

test('normalizeWorkflowCommand preserves a structured clarification response', () => {
    const result = normalizeWorkflowCommand({ type: 'submit_clarification', text: 'Email provider: Gmail', state: { provider: ['Gmail'] } });
    assert.deepEqual(result, {
        type: 'submit_clarification',
        text: 'Email provider: Gmail',
        state: { provider: ['Gmail'] }
    });
});

test('normalizeWorkflowCommand returns empty submit_text when no input is given', () => {
    const result = normalizeWorkflowCommand();
    assert.equal(result.type, 'submit_text');
    assert.equal(result.text, '');
});

test('normalizeWorkflowCommand rejects a legacy string command', () => {
    const result = normalizeWorkflowCommand('add a step');
    assert.equal(result.type, 'submit_text');
    assert.equal(result.text, '');
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

test('resolveWorkflowTurnContext retains structured clarification state', () => {
    const ctx = resolveWorkflowTurnContext({
        command: { type: 'submit_clarification', text: 'Email provider: Gmail', state: { provider: ['Gmail'] } },
        activeWork: { sourceText: 'Add an email step' }
    });
    assert.equal(ctx.command.type, 'submit_clarification');
    assert.deepEqual(ctx.command.state, { provider: ['Gmail'] });
    assert.equal(ctx.intent.sourceText, 'Add an email step');
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
