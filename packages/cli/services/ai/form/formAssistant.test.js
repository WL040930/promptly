import test from 'node:test';
import assert from 'node:assert/strict';
import { createFormAssistant } from './formAssistant.js';

const createMemoryModels = () => {
    const forms = [{ id: 'form_1', userId: 'user_1', title: 'Event', description: '', settings: {}, fields: [], updatedAt: new Date().toISOString() }];
    const messages = [];
    const threads = [];
    const instance = value => ({
        ...value,
        toJSON() { return { ...this, ...(this.kind === 'form_proposal' ? { proposal: this.payload } : {}), ...(this.kind === 'clarification' ? { options: this.payload } : {}) }; },
        async update(patch) { Object.assign(value, patch); Object.assign(this, patch); return this; }
    });
    const findBy = (rows, where) => rows.find(row => Object.entries(where || {}).every(([key, value]) => row[key] === value));
    const model = rows => ({
        async findOne({ where }) { const row = findBy(rows, where); return row ? instance(row) : null; },
        async findAll() { return rows.map(instance); },
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
            type: 'message',
            message: 'Where should the section go?',
            inputs: [{ id: 'position', type: 'text', label: 'Position' }]
        }),
        idFactory: (() => { let count = 0; return prefix => `${prefix}_${++count}`; })()
    });

    const result = await assistant.submitTurn({
        userId: 'user_1',
        formId: 'form_1',
        text: 'Add a section',
        clarificationMode: 'decide_everything'
    });

    assert.equal(result.userMsg.sender, 'user');
    assert.equal(result.botMsg.options.allowDecide, true);
    assert.equal(result.state.phase, 'awaiting_clarification');
    assert.equal(memory.messages.length, 2);
});

test('form assistant preserves non-fatal form AI warnings in the reviewable proposal', async () => {
    const memory = createMemoryModels();
    const assistant = createFormAssistant({
        models: memory.models,
        db: { transaction: async callback => callback({}) },
        runTurn: async () => ({
            kind: 'proposal',
            type: 'proposal',
            message: 'Prepared the application form.',
            schema: { title: 'Application', description: '', settings: {}, fields: [] },
            patches: [],
            warnings: [{ code: 'UNSUPPORTED_SETTINGS_IGNORED', message: 'Ignored an unsupported optional setting.' }]
        })
    });

    const result = await assistant.submitTurn({ userId: 'user_1', formId: 'form_1', text: 'Create an application form' });

    assert.deepEqual(result.botMsg.proposal.warnings, [{ code: 'UNSUPPORTED_SETTINGS_IGNORED', message: 'Ignored an unsupported optional setting.' }]);
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
        text: 'Added a section heading.',
        payload: {
            status: 'pending',
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

    assert.equal(result.proposal.status, 'accepted');
    assert.equal(result.form.fields[0].type, 'heading');
    assert.equal(memory.threads[0].state.phase, 'idle');
    assert.equal(memory.threads[0].state.activeProposalMessageId, null);
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
                return { kind: 'clarification', type: 'message', message: 'Where should the section go?', inputs: [{ id: 'position', type: 'text' }] };
            }
            if (calls.length === 2) {
                return {
                    kind: 'proposal',
                    type: 'proposal',
                    message: 'Added a section heading.',
                    schema: { title: 'Event', description: '', settings: {}, fields: [{ id: 'heading', type: 'heading', label: 'Contact Information' }] },
                    patches: [{ op: 'add', field: { id: 'heading', type: 'heading', label: 'Contact Information' } }]
                };
            }
            return { kind: 'reply', type: 'reply', message: 'I understand the heading request.' };
        },
        idFactory: (() => { let count = 0; return prefix => `${prefix}_${++count}`; })()
    });

    await assistant.submitTurn({ userId: 'user_1', formId: 'form_1', text: 'Add some section', clarificationMode: 'important_only' });
    await assistant.submitTurn({ userId: 'user_1', formId: 'form_1', command: { type: 'decide_for_me' }, clarificationMode: 'important_only' });
    await assistant.submitTurn({ userId: 'user_1', formId: 'form_1', text: 'I mean section heading', clarificationMode: 'important_only' });

    assert.equal(calls[1].turnContext.scope, 'heading_only');
    assert.equal(calls[2].turnContext.scope, 'heading_only');
    assert.equal(calls[2].turnContext.relationToPending, 'replace');
    assert.equal(calls[2].pendingProposal, null);
});
