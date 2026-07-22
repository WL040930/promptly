import test from 'node:test';
import assert from 'node:assert/strict';
import { createFormAssistant } from './formAssistant.js';

const createMemoryModels = () => {
    const forms = [{ id: 'form_1', userId: 'user_1', title: 'Event', description: '', settings: {}, fields: [], updatedAt: new Date().toISOString() }];
    const messages = [];
    const states = [];
    const instance = value => ({
        ...value,
        toJSON() { return { ...this }; },
        async update(patch) { Object.assign(this, patch); return this; }
    });
    const findBy = (rows, where) => rows.find(row => Object.entries(where || {}).every(([key, value]) => row[key] === value));
    const model = rows => ({
        async findOne({ where }) { const row = findBy(rows, where); return row ? instance(row) : null; },
        async findAll() { return rows.map(instance); },
        async create(value) { const row = instance(value); rows.push(row); return row; }
    });
    const Form = model(forms);
    const FormChatMessage = model(messages);
    const FormAIState = {
        async findOrCreate({ where, defaults }) {
            let row = findBy(states, where);
            if (!row) { row = instance({ ...defaults, version: 1, phase: 'idle', mode: 'important_only' }); states.push(row); }
            return [row, !row];
        },
        async findOne({ where }) { const row = findBy(states, where); return row || null; }
    };
    return { models: { Form, FormChatMessage, FormAIState }, messages, states };
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

test('form assistant accepts a proposal through the same state boundary', async () => {
    const memory = createMemoryModels();
    const state = (await memory.models.FormAIState.findOrCreate({
        where: { formId: 'form_1' },
        defaults: { formId: 'form_1' }
    }))[0];
    state.activeProposalMessageId = 'proposal_1';
    state.phase = 'awaiting_proposal';
    await memory.models.FormChatMessage.create({
        id: 'proposal_1',
        formId: 'form_1',
        sender: 'bot',
        text: 'Added a section heading.',
        proposal: {
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
    assert.equal(memory.states[0].phase, 'idle');
    assert.equal(memory.states[0].activeProposalMessageId, null);
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
