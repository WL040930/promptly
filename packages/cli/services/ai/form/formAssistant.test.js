import test from 'node:test';
import assert from 'node:assert/strict';
import { createFormAssistant } from './formAssistant.js';

const createMemoryModels = () => {
    const forms = [{ id: 'form_1', userId: 'user_1', title: 'Event', description: '', settings: {}, fields: [], updatedAt: new Date().toISOString() }];
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
    const Form = model(forms);
    const AssistantMessage = model(messages);
    const AssistantThread = {
        async findOne({ where }) { const row = findBy(threads, where); return row ? instance(row) : null; },
        async create(value) {
            const row = instance(value);
            threads.push(row);
            return row;
        }
    };
    return { models: { Form, AssistantMessage, AssistantThread }, forms, messages, threads };
};

test('form assistant persists a clarification and opens explicit decision state', async () => {
    const memory = createMemoryModels();
    const assistant = createFormAssistant({
        models: memory.models,
        db: { transaction: async callback => callback({}) },
        runTurn: async () => ({
            kind: 'clarification',
            message: 'Where should the section go?',
            inputs: [{ id: 'position', type: 'text', label: 'Position' }]
        }),
        idFactory: (() => { let count = 0; return prefix => `${prefix}_${++count}`; })()
    });

    const result = await assistant.submitTurn({
        userId: 'user_1',
        formId: 'form_1',
        command: { type: 'submit_text', text: 'Add a section' },
        clarificationMode: 'decide_everything'
    });

    assert.equal(result.userMsg.sender, 'user');
    assert.equal(result.botMsg.payload.allowDecide, true);
    assert.equal(result.state.phase, 'awaiting_clarification');
    assert.equal(memory.messages.length, 2);
    assert.equal(memory.messages[1].kind, 'clarification');
    assert.equal(memory.messages[1].payload.work.status, 'needs_input');
});

test('form assistant preserves non-fatal form AI warnings in the reviewable proposal', async () => {
    const memory = createMemoryModels();
    const assistant = createFormAssistant({
        models: memory.models,
        db: { transaction: async callback => callback({}) },
        runTurn: async () => ({
            kind: 'proposal',
            message: 'Prepared the application form.',
            schema: { title: 'Application', description: '', settings: {}, fields: [] },
            patches: [],
            warnings: [{ code: 'UNSUPPORTED_SETTINGS_IGNORED', message: 'Ignored an unsupported optional setting.' }]
        })
    });

    const result = await assistant.submitTurn({ userId: 'user_1', formId: 'form_1', command: { type: 'submit_text', text: 'Create an application form' } });

    assert.deepEqual(result.botMsg.payload.warnings, [{ code: 'UNSUPPORTED_SETTINGS_IGNORED', message: 'Ignored an unsupported optional setting.' }]);
});

test('form assistant reports the authoritative version when a turn is stale', async () => {
    const memory = createMemoryModels();
    await memory.models.AssistantThread.create({
        id: 'thread_1', userId: 'user_1', surface: 'form', formId: 'form_1',
        state: { version: 4, phase: 'idle' }, context: {}
    });
    const assistant = createFormAssistant({
        models: memory.models,
        db: { transaction: async callback => callback({}) },
        runTurn: async () => {
            throw new Error('The pipeline must not run for a stale turn.');
        }
    });

    await assert.rejects(
        () => assistant.submitTurn({ userId: 'user_1', formId: 'form_1', command: { type: 'submit_text', text: 'Add a section' }, expectedStateVersion: 3 }),
        error => error.code === 'FORM_AI_STATE_CONFLICT' && error.currentStateVersion === 4
    );
});

test('form assistant only accepts canonical command input', async () => {
    const memory = createMemoryModels();
    const assistant = createFormAssistant({
        models: memory.models,
        db: { transaction: async callback => callback({}) },
        runTurn: async () => {
            throw new Error('The pipeline must not run for an invalid command.');
        }
    });

    await assert.rejects(
        () => assistant.submitTurn({ userId: 'user_1', formId: 'form_1', text: 'Legacy text input' }),
        error => error.code === 'FORM_AI_EMPTY_PROMPT'
    );
});

test('form assistant history uses the oldest message in the page as its cursor', async () => {
    const memory = createMemoryModels();
    const thread = await memory.models.AssistantThread.create({
        id: 'thread_1', userId: 'user_1', surface: 'form', formId: 'form_1', state: { version: 1, phase: 'idle' }, context: {}
    });
    await memory.models.AssistantMessage.create({ id: 'message_1', threadId: thread.id, sender: 'user', text: 'First', createdAt: '2026-01-01T00:00:00.000Z' });
    await memory.models.AssistantMessage.create({ id: 'message_2', threadId: thread.id, sender: 'bot', text: 'Second', createdAt: '2026-01-01T00:01:00.000Z' });
    await memory.models.AssistantMessage.create({ id: 'message_3', threadId: thread.id, sender: 'user', text: 'Third', createdAt: '2026-01-01T00:02:00.000Z' });
    const assistant = createFormAssistant({ models: memory.models, db: { transaction: async callback => callback({}) } });

    const firstPage = await assistant.getHistory({ userId: 'user_1', formId: 'form_1', limit: 2 });
    const secondPage = await assistant.getHistory({ userId: 'user_1', formId: 'form_1', limit: 2, before: firstPage.nextBefore });

    assert.deepEqual(firstPage.messages.map(message => message.id), ['message_2', 'message_3']);
    assert.equal(firstPage.nextBefore, 'message_2');
    assert.deepEqual(secondPage.messages.map(message => message.id), ['message_1']);
});

test('form assistant clears chat messages without changing the form', async () => {
    const memory = createMemoryModels();
    const thread = await memory.models.AssistantThread.create({ id: 'thread_1', userId: 'user_1', surface: 'form', formId: 'form_1', state: { version: 1, phase: 'idle' }, context: {} });
    await memory.models.AssistantMessage.create({ id: 'message_1', threadId: thread.id, sender: 'user', text: 'Keep the form' });
    const assistant = createFormAssistant({
        models: memory.models,
        db: { transaction: async callback => callback({ LOCK: { UPDATE: 'update' } }) }
    });

    const result = await assistant.clearChat({ userId: 'user_1', formId: 'form_1' });

    assert.equal(result.cleared, true);
    assert.equal(result.deletedMessages, 1);
    assert.equal(memory.messages.length, 0);
    assert.equal(memory.threads[0].state.phase, 'idle');
    assert.equal(memory.forms[0].title, 'Event');
});

test('form assistant accepts a proposal through the same state boundary', async () => {
    const memory = createMemoryModels();
    const state = await memory.models.AssistantThread.create({
        id: 'thread_1', userId: 'user_1', surface: 'form', formId: 'form_1',
        state: { version: 1, phase: 'awaiting_proposal', activeProposalMessageId: 'proposal_1' }, context: {}
    });
    await memory.models.AssistantMessage.create({
        id: 'proposal_1',
        threadId: state.id,
        sender: 'bot',
        kind: 'form_proposal',
        proposalStatus: 'pending',
        text: 'Added a section heading.',
        payload: {
            verification: { status: 'pass' },
            patches: [{ op: 'add', field: { id: 'heading_contact', type: 'heading', label: 'Contact Information' } }]
        }
    });

    const assistant = createFormAssistant({
        models: memory.models,
        db: { transaction: async callback => callback({}) }
    });
    const result = await assistant.decideProposal({
        userId: 'user_1',
        formId: 'form_1',
        proposalMessageId: 'proposal_1'
    });

    assert.equal(result.message.proposalStatus, 'applied');
    assert.equal(result.form.fields[0].type, 'heading');
    assert.equal(memory.threads[0].state.phase, 'idle');
    assert.equal(memory.threads[0].state.activeProposalMessageId, null);
});

test('form assistant permits applying a locally valid unverified proposal after user review', async () => {
    const memory = createMemoryModels();
    const state = await memory.models.AssistantThread.create({
        id: 'thread_1', userId: 'user_1', surface: 'form', formId: 'form_1',
        state: { version: 1, phase: 'awaiting_proposal', activeProposalMessageId: 'proposal_1' }, context: {}
    });
    await memory.models.AssistantMessage.create({
        id: 'proposal_1', threadId: state.id, sender: 'bot', kind: 'form_proposal', proposalStatus: 'pending', text: 'Add an email field.',
        payload: {
            verification: { status: 'unverified', skippedReason: 'AI_CALL_BUDGET_EXCEEDED' },
            patches: [{ op: 'add', field: { id: 'email', type: 'email', label: 'Email' } }]
        }
    });

    const assistant = createFormAssistant({ models: memory.models, db: { transaction: async callback => callback({}) } });
    const result = await assistant.decideProposal({ userId: 'user_1', formId: 'form_1', proposalMessageId: 'proposal_1' });

    assert.equal(result.message.proposalStatus, 'applied');
    assert.equal(result.form.fields[0].id, 'email');
});

test('form assistant rejects a proposal decision against a stale conversation version', async () => {
    const memory = createMemoryModels();
    const state = await memory.models.AssistantThread.create({
        id: 'thread_1', userId: 'user_1', surface: 'form', formId: 'form_1',
        state: { version: 4, phase: 'awaiting_proposal', activeProposalMessageId: 'proposal_1' }, context: {}
    });
    await memory.models.AssistantMessage.create({
        id: 'proposal_1', threadId: state.id, sender: 'bot', kind: 'form_proposal', proposalStatus: 'pending', text: 'Add email.',
        payload: { patches: [{ op: 'add', field: { id: 'email', type: 'email', label: 'Email' } }] }
    });
    const assistant = createFormAssistant({ models: memory.models, db: { transaction: async callback => callback({}) } });

    await assert.rejects(
        () => assistant.decideProposal({ userId: 'user_1', formId: 'form_1', proposalMessageId: 'proposal_1', expectedStateVersion: 3 }),
        error => error.code === 'FORM_AI_STATE_CONFLICT' && error.currentStateVersion === 4
    );
    assert.equal(memory.messages[0].proposalStatus, 'pending');
});

test('form assistant uses the proposal revision stored on the server when applying', async () => {
    const memory = createMemoryModels();
    memory.forms[0].updatedAt = '2026-01-02T00:00:00.000Z';
    const state = await memory.models.AssistantThread.create({
        id: 'thread_1', userId: 'user_1', surface: 'form', formId: 'form_1',
        state: { version: 1, phase: 'awaiting_proposal', activeProposalMessageId: 'proposal_1' }, context: {}
    });
    await memory.models.AssistantMessage.create({
        id: 'proposal_1', threadId: state.id, sender: 'bot', kind: 'form_proposal', proposalStatus: 'pending', text: 'Add email.',
        payload: {
            baseFormUpdatedAt: '2026-01-01T00:00:00.000Z',
            patches: [{ op: 'add', field: { id: 'email', type: 'email', label: 'Email' } }]
        }
    });
    const assistant = createFormAssistant({ models: memory.models, db: { transaction: async callback => callback({}) } });

    await assert.rejects(
        () => assistant.decideProposal({
            userId: 'user_1', formId: 'form_1', proposalMessageId: 'proposal_1',
            baseFormUpdatedAt: '2026-01-02T00:00:00.000Z'
        }),
        error => error.code === 'FORM_PROPOSAL_STALE'
    );
    assert.equal(memory.messages[0].proposalStatus, 'stale');
});

test('form assistant rejects a proposal without letting the client alter its patches', async () => {
    const memory = createMemoryModels();
    const state = await memory.models.AssistantThread.create({
        id: 'thread_1', userId: 'user_1', surface: 'form', formId: 'form_1',
        state: { version: 1, phase: 'awaiting_proposal', activeProposalMessageId: 'proposal_1' }, context: {}
    });
    await memory.models.AssistantMessage.create({
        id: 'proposal_1',
        threadId: state.id,
        sender: 'bot',
        kind: 'form_proposal',
        proposalStatus: 'pending',
        text: 'Add a field.',
        payload: {
            patches: [{ op: 'add', field: { id: 'email', type: 'email', label: 'Email' } }]
        }
    });

    const assistant = createFormAssistant({
        models: memory.models,
        db: { transaction: async callback => callback({}) }
    });
    const result = await assistant.decideProposal({
        userId: 'user_1',
        formId: 'form_1',
        proposalMessageId: 'proposal_1',
        action: 'reject'
    });

    assert.equal(result.message.proposalStatus, 'rejected');
    assert.equal(memory.forms[0].fields.length, 0);
    assert.equal(memory.messages[0].payload.patches[0].field.id, 'email');
});

test('form assistant keeps section intent and excludes the prior proposal on correction', async () => {
    const memory = createMemoryModels();
    const calls = [];
    const assistant = createFormAssistant({
        models: memory.models,
        db: { transaction: async callback => callback({}) },
        runTurn: async args => {
            calls.push(args);
            if (calls.length === 1) {
                return { kind: 'clarification', message: 'Where should the section go?', inputs: [{ id: 'position', type: 'text' }] };
            }
            if (calls.length === 2) {
                return {
                    kind: 'proposal',
                    message: 'Added a section heading.',
                    schema: { title: 'Event', description: '', settings: {}, fields: [{ id: 'heading', type: 'heading', label: 'Contact Information' }] },
                    patches: [{ op: 'add', field: { id: 'heading', type: 'heading', label: 'Contact Information' } }]
                };
            }
            return { kind: 'reply', message: 'I understand the heading request.' };
        },
        idFactory: (() => { let count = 0; return prefix => `${prefix}_${++count}`; })()
    });

    await assistant.submitTurn({ userId: 'user_1', formId: 'form_1', command: { type: 'submit_text', text: 'Add some section' }, clarificationMode: 'important_only' });
    await assistant.submitTurn({ userId: 'user_1', formId: 'form_1', command: { type: 'decide_for_me' }, clarificationMode: 'important_only' });
    await assistant.submitTurn({ userId: 'user_1', formId: 'form_1', command: { type: 'submit_text', text: 'I mean section heading' }, clarificationMode: 'important_only' });

    assert.equal(calls[1].turnContext.scope, 'heading_only');
    assert.equal(calls[0].resourceContext.identity.name, 'Event');
    assert.equal(calls[0].resourceContext.brief.purpose, 'Event');
    assert.equal(calls[2].turnContext.scope, 'heading_only');
    assert.equal(calls[2].turnContext.relationToPending, 'replace');
    assert.equal(calls[2].pendingProposal, null);
});

test('form assistant persists processing progress while a turn is running', async () => {
    const memory = createMemoryModels();
    let release;
    const pendingTurn = new Promise(resolve => { release = resolve; });
    const assistant = createFormAssistant({
        models: memory.models,
        db: { transaction: async callback => callback({}) },
        runTurn: async ({ onProgress }) => {
            onProgress({ status: 'building', message: 'Preparing form changes…' });
            await pendingTurn;
            return { kind: 'reply', message: 'Done.' };
        }
    });

    const turn = assistant.submitTurn({ userId: 'user_1', formId: 'form_1', command: { type: 'submit_text', text: 'Add an email field' } });
    await new Promise(resolve => setImmediate(resolve));

    assert.equal(memory.threads[0].state.phase, 'processing');
    assert.equal(memory.threads[0].state.progress.message, 'Preparing form changes…');

    release();
    await turn;
});

test('form assistant failure wins over queued progress writes and returns idle state', async () => {
    const memory = createMemoryModels();
    let releaseProgress;
    const progressBlocked = new Promise(resolve => { releaseProgress = resolve; });
    let transactionCount = 0;
    const assistant = createFormAssistant({
        models: memory.models,
        db: {
            transaction: async callback => {
                transactionCount += 1;
                if (transactionCount === 2) await progressBlocked;
                return callback({});
            }
        },
        runTurn: async ({ onProgress }) => {
            onProgress({ id: 'worker:attempt:3', status: 'awaiting_model', phase: 'draft', label: 'Drafting form changes', detail: 'Attempt 3 of 4.' });
            const error = new Error('The generated changes were invalid.');
            error.code = 'FORM_AI_UNSAFE_PROPOSAL';
            error.issues = [{ code: 'UNKNOWN_PLACEMENT_ANCHOR', path: 'patches[1].insertAfter', message: 'Placement anchor does not exist.' }];
            throw error;
        }
    });

    const turn = assistant.submitTurn({ userId: 'user_1', formId: 'form_1', command: { type: 'submit_text', text: 'Create an event form' } });
    await new Promise(resolve => setImmediate(resolve));
    releaseProgress();
    const result = await turn;
    await new Promise(resolve => setImmediate(resolve));

    assert.equal(result.botMsg.kind, 'error');
    assert.equal(result.botMsg.payload.work.status, 'failed');
    assert.equal(result.state.phase, 'idle');
    assert.equal(memory.messages[1].payload.work.status, 'failed');
    assert.equal(memory.threads[0].state.phase, 'idle');
});

test('form assistant preserves an existing pending proposal when a follow-up fails', async () => {
    const memory = createMemoryModels();
    const state = await memory.models.AssistantThread.create({
        id: 'thread_1', userId: 'user_1', surface: 'form', formId: 'form_1',
        state: { version: 1, phase: 'awaiting_proposal', activeProposalMessageId: 'proposal_1' }, context: {}
    });
    await memory.models.AssistantMessage.create({
        id: 'proposal_1', threadId: state.id, sender: 'bot', kind: 'form_proposal', proposalStatus: 'pending', text: 'Add email.',
        payload: { patches: [{ op: 'add', field: { id: 'email', type: 'email', label: 'Email' } }] }
    });
    const assistant = createFormAssistant({
        models: memory.models,
        db: { transaction: async callback => callback({}) },
        runTurn: async () => {
            const error = new Error('The provider timed out.');
            error.code = 'FORM_AI_PROVIDER_TIMEOUT';
            throw error;
        }
    });

    const result = await assistant.submitTurn({
        userId: 'user_1', formId: 'form_1', command: { type: 'submit_text', text: 'Make it shorter' }
    });

    assert.equal(result.botMsg.kind, 'error');
    assert.equal(result.state.phase, 'awaiting_proposal');
    assert.equal(result.state.activeProposalMessageId, 'proposal_1');
    assert.equal(memory.messages[0].proposalStatus, 'pending');
});

test('form assistant supersedes a pending proposal after a draft revision', async () => {
    const memory = createMemoryModels();
    const state = await memory.models.AssistantThread.create({
        id: 'thread_1', userId: 'user_1', surface: 'form', formId: 'form_1',
        state: { version: 1, phase: 'awaiting_proposal', activeProposalMessageId: 'proposal_1' }, context: {}
    });
    await memory.models.AssistantMessage.create({
        id: 'proposal_1', threadId: state.id, sender: 'bot', kind: 'form_proposal', proposalStatus: 'pending', text: 'Add Phone and Company.',
        payload: {
            baseFormUpdatedAt: memory.forms[0].updatedAt,
            schema: { ...memory.forms[0], fields: [...memory.forms[0].fields, { id: 'phone', type: 'phone', label: 'Phone' }, { id: 'company', type: 'text', label: 'Company' }] },
            patches: [{ op: 'add', field: { id: 'phone', type: 'phone', label: 'Phone' } }, { op: 'add', field: { id: 'company', type: 'text', label: 'Company' } }]
        }
    });
    let receivedPendingProposal;
    const assistant = createFormAssistant({
        models: memory.models,
        db: { transaction: async callback => callback({}) },
        idFactory: (() => { let count = 0; return prefix => `${prefix}_${++count}`; })(),
        runTurn: async ({ pendingProposal }) => {
            receivedPendingProposal = pendingProposal;
            return {
                kind: 'proposal',
                message: 'Keep Phone and remove Company.',
                revisesProposalMessageId: pendingProposal.messageId,
                schema: { ...memory.forms[0], fields: [...memory.forms[0].fields, { id: 'phone', type: 'phone', label: 'Phone' }] },
                patches: [{ op: 'add', field: { id: 'phone', type: 'phone', label: 'Phone' } }],
                requirements: [{ id: 'req_phone', description: 'Keep the Phone field.' }],
                verification: { status: 'pass', issues: [] }
            };
        }
    });

    const result = await assistant.submitTurn({
        userId: 'user_1', formId: 'form_1', command: { type: 'submit_text', text: 'dont need the company' }
    });

    assert.equal(receivedPendingProposal.messageId, 'proposal_1');
    assert.equal(memory.messages[0].proposalStatus, 'superseded');
    assert.equal(memory.messages[0].payload.supersededBy, result.botMsg.id);
    assert.equal(result.botMsg.payload.revisesProposalMessageId, 'proposal_1');
    assert.equal(result.botMsg.proposalStatus, 'pending');
});

test('form assistant closes a pending proposal when its revision leaves no changes', async () => {
    const memory = createMemoryModels();
    const state = await memory.models.AssistantThread.create({
        id: 'thread_1', userId: 'user_1', surface: 'form', formId: 'form_1',
        state: { version: 1, phase: 'awaiting_proposal', activeProposalMessageId: 'proposal_1' }, context: {}
    });
    await memory.models.AssistantMessage.create({
        id: 'proposal_1', threadId: state.id, sender: 'bot', kind: 'form_proposal', proposalStatus: 'pending', text: 'Add Company.',
        payload: { patches: [{ op: 'add', field: { id: 'company', type: 'text', label: 'Company' } }] }
    });
    const assistant = createFormAssistant({
        models: memory.models,
        db: { transaction: async callback => callback({}) },
        runTurn: async () => ({
            kind: 'reply',
            message: 'That removes every pending form change, so there is nothing left to apply.',
            pendingProposalDisposition: 'supersede'
        }),
        idFactory: (() => { let count = 0; return prefix => `${prefix}_${++count}`; })()
    });

    const result = await assistant.submitTurn({
        userId: 'user_1', formId: 'form_1', command: { type: 'submit_text', text: 'dont need company' }
    });

    assert.equal(memory.messages[0].proposalStatus, 'superseded');
    assert.equal(result.state.activeProposalMessageId, null);
    assert.equal(result.state.phase, 'idle');
    assert.equal(result.botMsg.kind, 'text');
});

test('form assistant marks a pending proposal stale before a stale-draft revision can continue', async () => {
    const memory = createMemoryModels();
    const state = await memory.models.AssistantThread.create({
        id: 'thread_1', userId: 'user_1', surface: 'form', formId: 'form_1',
        state: { version: 1, phase: 'awaiting_proposal', activeProposalMessageId: 'proposal_1' }, context: {}
    });
    await memory.models.AssistantMessage.create({
        id: 'proposal_1', threadId: state.id, sender: 'bot', kind: 'form_proposal', proposalStatus: 'pending', text: 'Add Company.',
        payload: { patches: [{ op: 'add', field: { id: 'company', type: 'text', label: 'Company' } }] }
    });
    const assistant = createFormAssistant({
        models: memory.models,
        db: { transaction: async callback => callback({}) },
        runTurn: async () => ({
            kind: 'reply',
            message: 'This form changed while the pending draft was waiting. Generate a new suggestion from the latest form.',
            pendingProposalDisposition: 'stale'
        }),
        idFactory: (() => { let count = 0; return prefix => `${prefix}_${++count}`; })()
    });

    const result = await assistant.submitTurn({
        userId: 'user_1', formId: 'form_1', command: { type: 'submit_text', text: 'dont need company' }
    });

    assert.equal(memory.messages[0].proposalStatus, 'stale');
    assert.deepEqual(result.staleProposalMessageIds, ['proposal_1']);
    assert.equal(result.state.activeProposalMessageId, null);
    assert.equal(result.state.phase, 'idle');
});
