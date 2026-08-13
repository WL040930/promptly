import assert from 'node:assert/strict';
import test from 'node:test';
import { createWorkflowAssistant, workflowAssistantInternals } from './workflowAssistant.js';

const { formIdForWorkflowNodes, normalizeWorkflowCommand, resolveWorkflowTurnContext, statePatchForResult } = workflowAssistantInternals;

const createMemoryModels = ({ emulateSequelizeDirtyUpdates = false } = {}) => {
    const workflows = [{ id: 'workflow_1', userId: 'user_1', name: 'Registration flow', revision: 1, nodes: [], edges: [] }];
    const forms = [];
    const messages = [];
    const threads = [];
    const instance = value => ({
        ...value,
        toJSON() { return { ...this }; },
        async update(patch) {
            const persistedPatch = emulateSequelizeDirtyUpdates
                ? Object.fromEntries(Object.entries(patch).filter(([key, nextValue]) => this[key] !== nextValue))
                : patch;
            Object.assign(value, persistedPatch);
            Object.assign(this, patch);
            return this;
        }
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

test('workflow assistant keeps a provisioned proposal while a Sheet refinement needs a destination choice', async () => {
    const memory = createMemoryModels();
    await memory.models.AssistantThread.create({
        id: 'thread_1', userId: 'user_1', surface: 'workflow', workflowId: 'workflow_1',
        state: { version: 1, phase: 'awaiting_proposal', activeProposalMessageId: 'proposal_1' }, context: {}
    });
    await memory.models.AssistantMessage.create({
        id: 'proposal_1', threadId: 'thread_1', sender: 'bot', kind: 'workflow_proposal', proposalStatus: 'pending', text: 'Create a response Sheet.',
        payload: {
            workflowId: 'workflow_1', baseWorkflowRevision: 1, nodes: [], edges: [],
            resourceChanges: [{ type: 'create_google_spreadsheet', ref: 'responses_sheet', title: 'Event Registration' }],
            resourceIntent: { mode: 'create', source: 'request' }
        }
    });
    const assistant = createWorkflowAssistant({
        models: memory.models,
        db: { transaction: async callback => callback({}) },
        runTurn: async () => ({
            kind: 'clarification',
            message: 'Paste the existing Google Sheet URL or ID.',
            inputs: [{ id: 'spreadsheetId', type: 'text', label: 'Spreadsheet URL or ID' }]
        }),
        idFactory: (() => { let count = 0; return prefix => `${prefix}_${++count}`; })()
    });

    const result = await assistant.submitTurn({
        userId: 'user_1', workflowId: 'workflow_1', command: { type: 'submit_text', text: "Don't create the Sheet." }
    });

    assert.equal(result.botMsg.kind, 'clarification');
    assert.equal(result.state.phase, 'awaiting_clarification');
    assert.equal(result.state.activeProposalMessageId, 'proposal_1');
    assert.equal(memory.messages.find(message => message.id === 'proposal_1').proposalStatus, 'pending');
});

test('workflow assistant supersedes a provisioned proposal only after its Sheet-free revision succeeds', async () => {
    const memory = createMemoryModels();
    await memory.models.AssistantThread.create({
        id: 'thread_1', userId: 'user_1', surface: 'workflow', workflowId: 'workflow_1',
        state: { version: 1, phase: 'awaiting_proposal', activeProposalMessageId: 'proposal_1' }, context: {}
    });
    await memory.models.AssistantMessage.create({
        id: 'proposal_1', threadId: 'thread_1', sender: 'bot', kind: 'workflow_proposal', proposalStatus: 'pending', text: 'Create a response Sheet.',
        payload: {
            workflowId: 'workflow_1', baseWorkflowRevision: 1, nodes: [], edges: [],
            resourceChanges: [{ type: 'create_google_spreadsheet', ref: 'responses_sheet', title: 'Event Registration' }],
            resourceIntent: { mode: 'create', source: 'request' }
        }
    });
    let receivedPending;
    const assistant = createWorkflowAssistant({
        models: memory.models,
        db: { transaction: async callback => callback({}) },
        runTurn: async ({ pendingProposal }) => {
            receivedPending = pendingProposal;
            return {
                kind: 'proposal', message: 'Use the existing Event Registration Sheet.',
                requirements: [{ id: 'req_1', description: 'Append the response to the selected Sheet.' }],
                capabilities: [], nodes: [], edges: [], operations: [],
                diff: { addedNodes: [], updatedNodes: [], removedNodes: [], edges: [] },
                readiness: { canApply: true }, verification: { status: 'pass' }, warnings: [], resourceChanges: [],
                resourceIntent: { mode: 'existing_selected', source: 'history', name: 'Event Registration', spreadsheetId: 'sheet_event' }
            };
        },
        idFactory: (() => { let count = 0; return prefix => `${prefix}_${++count}`; })()
    });

    const result = await assistant.submitTurn({
        userId: 'user_1', workflowId: 'workflow_1', command: { type: 'submit_text', text: "Don't create the Sheet; use the existing Event Registration Sheet." }
    });

    assert.equal(receivedPending.id, 'proposal_1');
    assert.equal(memory.messages.find(message => message.id === 'proposal_1').proposalStatus, 'superseded');
    assert.equal(result.botMsg.proposalStatus, 'pending');
    assert.deepEqual(result.botMsg.payload.resourceChanges, []);
    assert.equal(result.botMsg.payload.resourceIntent.spreadsheetId, 'sheet_event');
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

test('workflow history recovers an orphaned applying spreadsheet proposal', async () => {
    const memory = createMemoryModels();
    await memory.models.AssistantThread.create({
        id: 'thread_1', userId: 'user_1', surface: 'workflow', workflowId: 'workflow_1',
        state: { version: 4, phase: 'awaiting_proposal', activeProposalMessageId: 'proposal_1' }, context: {}
    });
    await memory.models.AssistantMessage.create({
        id: 'proposal_1', threadId: 'thread_1', sender: 'bot', kind: 'workflow_proposal', proposalStatus: 'applying', text: 'Create a response sheet.',
        payload: {
            workflowId: 'workflow_1', baseWorkflowRevision: 1, nodes: [], edges: [],
            readiness: { canApply: true },
            resourceChanges: [{ type: 'create_google_spreadsheet', ref: 'responses_sheet', title: 'Event Registration' }],
            apply: { status: 'applying', startedAt: '2026-01-01T00:00:00.000Z' }
        }
    });

    const assistant = createWorkflowAssistant({
        models: memory.models,
        db: { transaction: async callback => callback({ LOCK: { UPDATE: 'UPDATE' } }) },
        now: () => new Date('2026-01-01T00:10:00.000Z'),
        proposalApplyStaleAfterMs: 60_000
    });

    const history = await assistant.getHistory({ userId: 'user_1', workflowId: 'workflow_1' });

    assert.equal(memory.messages[0].proposalStatus, 'pending');
    assert.equal(memory.messages[0].payload.apply.status, 'recovered');
    assert.equal(history.state.phase, 'awaiting_proposal');
});

test('deciding a stale applying proposal recovers it before the status guard', async () => {
    const memory = createMemoryModels();
    await memory.models.AssistantThread.create({
        id: 'thread_1', userId: 'user_1', surface: 'workflow', workflowId: 'workflow_1',
        state: { version: 2, phase: 'awaiting_proposal', activeProposalMessageId: 'proposal_1' }, context: {}
    });
    await memory.models.AssistantMessage.create({
        id: 'proposal_1', threadId: 'thread_1', sender: 'bot', kind: 'workflow_proposal', proposalStatus: 'applying', text: 'Add a manual step.',
        payload: {
            workflowId: 'workflow_1', baseWorkflowRevision: 1, nodes: [], edges: [], readiness: { canApply: true },
            apply: { status: 'applying', startedAt: '2026-01-01T00:00:00.000Z' }
        }
    });
    const assistant = createWorkflowAssistant({
        models: memory.models,
        db: { transaction: async callback => callback({ LOCK: { UPDATE: 'UPDATE' } }) },
        saveDraft: async () => ({ automation: memory.workflows[0] }),
        now: () => new Date('2026-01-01T00:10:00.000Z'),
        proposalApplyStaleAfterMs: 60_000
    });

    const result = await assistant.decideProposal({ userId: 'user_1', workflowId: 'workflow_1', proposalMessageId: 'proposal_1' });

    assert.equal(result.message.proposalStatus, 'applied');
    assert.equal(memory.messages[0].proposalStatus, 'applied');
});

test('workflow preserves a Drive-created Sheet after a Sheets 403 so retry cannot duplicate it', async () => {
    // The locked record changes status to "applying", while the outer instance
    // still sees "pending". Sequelize will not persist that same stale value
    // unless the retry cleanup reloads the record first.
    const memory = createMemoryModels({ emulateSequelizeDirtyUpdates: true });
    await memory.models.AssistantThread.create({
        id: 'thread_1', userId: 'user_1', surface: 'workflow', workflowId: 'workflow_1',
        state: { version: 1, phase: 'awaiting_proposal', activeProposalMessageId: 'proposal_1' }, context: {}
    });
    await memory.models.AssistantMessage.create({
        id: 'proposal_1', threadId: 'thread_1', sender: 'bot', kind: 'workflow_proposal', proposalStatus: 'pending', text: 'Create a response sheet.',
        payload: {
            workflowId: 'workflow_1', baseWorkflowRevision: 1, nodes: [], edges: [], readiness: { canApply: true },
            resourceChanges: [{ type: 'create_google_spreadsheet', ref: 'responses_sheet', title: 'Event Registration' }]
        }
    });

    const calls = [];
    const assistant = createWorkflowAssistant({
        models: memory.models,
        db: { transaction: async callback => callback({ LOCK: { UPDATE: 'UPDATE' } }) },
        saveDraft: async ({ nodes, edges }) => ({ automation: { ...memory.workflows[0], nodes, edges, revision: 2 } }),
        spreadsheetService: {
            createAndInitialize: async options => {
                calls.push(options);
                await options.onFileReady({ id: 'spreadsheet_1', name: 'Event Registration', sheetTitle: 'Responses', range: "'Responses'!A1", webViewLink: 'https://sheet.test' });
                if (calls.length === 1) {
                    const error = new Error('Google denied Sheets access.');
                    error.code = 'GOOGLE_PERMISSION_REQUIRED';
                    throw error;
                }
                return { id: 'spreadsheet_1', name: 'Event Registration', range: "'Responses'!A1", webViewLink: 'https://sheet.test' };
            }
        }
    });

    await assert.rejects(
        () => assistant.decideProposal({ userId: 'user_1', workflowId: 'workflow_1', proposalMessageId: 'proposal_1' }),
        error => error.code === 'GOOGLE_PERMISSION_REQUIRED'
    );
    assert.equal(memory.messages[0].proposalStatus, 'pending');
    assert.equal(memory.messages[0].payload.resourceChanges[0].spreadsheetId, 'spreadsheet_1');

    await assistant.decideProposal({ userId: 'user_1', workflowId: 'workflow_1', proposalMessageId: 'proposal_1' });
    assert.equal(calls.length, 2);
    assert.equal(calls[1].existingSpreadsheetId, 'spreadsheet_1');
    assert.equal(memory.messages[0].proposalStatus, 'applied');
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

test('workflow AI carries a rename proposal through review without saving an unchanged graph', async () => {
    const memory = createMemoryModels();
    let saveDraftCalls = 0;
    const assistant = createWorkflowAssistant({
        models: memory.models,
        db: { transaction: async callback => callback({ LOCK: { UPDATE: 'UPDATE' } }) },
        runTurn: async () => ({
            kind: 'proposal',
            message: 'Rename this workflow to “Event Registration Automation”.',
            requirements: [{ id: 'req_rename', description: 'Rename the workflow.' }],
            capabilities: [],
            workflowUpdates: { name: 'Event Registration Automation' },
            nodes: [],
            edges: [],
            operations: [{ op: 'update_workflow', updates: { name: 'Event Registration Automation' } }],
            diff: { addedNodes: [], updatedNodes: [], removedNodes: [], edges: [], metadata: { name: { from: 'Registration flow', to: 'Event Registration Automation' } } },
            readiness: { canApply: true },
            verification: { status: 'pass' },
            warnings: []
        }),
        saveDraft: async () => { saveDraftCalls += 1; throw new Error('A rename must not save an unchanged graph.'); },
        idFactory: (() => { let count = 0; return prefix => `${prefix}_${++count}`; })()
    });

    const turn = await assistant.submitTurn({
        userId: 'user_1', workflowId: 'workflow_1', command: { type: 'submit_text', text: 'Rename this workflow' }
    });
    assert.deepEqual(turn.botMsg.payload.workflowUpdates, { name: 'Event Registration Automation' });

    await assistant.decideProposal({ userId: 'user_1', workflowId: 'workflow_1', proposalMessageId: turn.botMsg.id });
    assert.equal(memory.workflows[0].name, 'Event Registration Automation');
    assert.equal(saveDraftCalls, 0);
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

test('workflow AI rejects an empty request before it creates chat history', async () => {
    const memory = createMemoryModels();
    let runTurnCalls = 0;
    const assistant = createWorkflowAssistant({
        models: memory.models,
        db: { transaction: async callback => callback({}) },
        runTurn: async () => { runTurnCalls += 1; return { kind: 'reply', message: 'Unexpected.' }; }
    });

    await assert.rejects(
        () => assistant.submitTurn({ userId: 'user_1', workflowId: 'workflow_1', command: { type: 'submit_text', text: '   ' } }),
        error => error.code === 'WORKFLOW_AI_INPUT_REQUIRED'
    );

    assert.equal(runTurnCalls, 0);
    assert.equal(memory.threads.length, 0);
    assert.equal(memory.messages.length, 0);
});

test('workflow AI rejects a turn from an out-of-date browser state without invoking the model', async () => {
    const memory = createMemoryModels();
    await memory.models.AssistantThread.create({
        id: 'thread_1', userId: 'user_1', surface: 'workflow', workflowId: 'workflow_1',
        state: { version: 3, phase: 'idle' }, context: {}
    });
    let runTurnCalls = 0;
    const assistant = createWorkflowAssistant({
        models: memory.models,
        db: { transaction: async callback => callback({}) },
        runTurn: async () => { runTurnCalls += 1; return { kind: 'reply', message: 'Unexpected.' }; }
    });

    await assert.rejects(
        () => assistant.submitTurn({
            userId: 'user_1', workflowId: 'workflow_1', requestId: 'request_stale', expectedStateVersion: 2,
            command: { type: 'submit_text', text: 'Add an email step.' }
        }),
        error => error.code === 'WORKFLOW_AI_STATE_CONFLICT' && error.currentStateVersion === 3
    );

    assert.equal(runTurnCalls, 0);
    assert.equal(memory.messages.length, 0);
});

test('workflow AI records a structured clarification answer before continuing the original request', async () => {
    const memory = createMemoryModels();
    const turnContexts = [];
    let call = 0;
    const assistant = createWorkflowAssistant({
        models: memory.models,
        db: { transaction: async callback => callback({}) },
        runTurn: async args => {
            turnContexts.push(args.turnContext);
            call += 1;
            return call === 1
                ? { kind: 'clarification', message: 'Which provider?', inputs: [{ id: 'provider', type: 'single_choice', label: 'Provider', options: ['Gmail', 'Outlook'] }] }
                : { kind: 'reply', message: 'I will use Gmail.' };
        },
        idFactory: (() => { let count = 0; return prefix => `${prefix}_${++count}`; })()
    });

    await assistant.submitTurn({
        userId: 'user_1', workflowId: 'workflow_1', command: { type: 'submit_text', text: 'Add an email notification.' }
    });
    const result = await assistant.submitTurn({
        userId: 'user_1', workflowId: 'workflow_1',
        command: { type: 'submit_clarification', text: 'Gmail', state: { provider: ['Gmail'] } }
    });
    const clarification = memory.messages.find(message => message.kind === 'clarification');

    assert.deepEqual(clarification.payload.selectedState, { provider: ['Gmail'] });
    assert.equal(clarification.payload.resolution.type, 'answered');
    assert.equal(turnContexts[1].sourceText, 'Add an email notification.');
    assert.deepEqual(turnContexts[1].latestText, 'Gmail');
    assert.equal(result.state.phase, 'idle');
});

test('rejecting the active workflow proposal marks it ignored and returns the assistant to idle', async () => {
    const memory = createMemoryModels();
    await memory.models.AssistantThread.create({
        id: 'thread_1', userId: 'user_1', surface: 'workflow', workflowId: 'workflow_1',
        state: { version: 3, phase: 'awaiting_proposal', activeProposalMessageId: 'proposal_1' }, context: {}
    });
    await memory.models.AssistantMessage.create({
        id: 'proposal_1', threadId: 'thread_1', sender: 'bot', kind: 'workflow_proposal', proposalStatus: 'pending', text: 'Add an email step.',
        payload: { workflowId: 'workflow_1', baseWorkflowRevision: 1, nodes: [], edges: [] }
    });
    const assistant = createWorkflowAssistant({ models: memory.models, db: { transaction: async callback => callback({}) } });

    const result = await assistant.decideProposal({
        userId: 'user_1', workflowId: 'workflow_1', proposalMessageId: 'proposal_1', action: 'reject', expectedStateVersion: 3
    });

    assert.equal(result.message.proposalStatus, 'rejected');
    assert.equal(result.state.phase, 'idle');
    assert.equal(result.state.activeProposalMessageId, null);
    assert.equal(memory.messages[0].payload.work.status, 'ignored');
});

test('workflow AI refuses a second request while the first is still generating', async () => {
    const memory = createMemoryModels();
    let releaseTurn;
    let generationStarted;
    const started = new Promise(resolve => { generationStarted = resolve; });
    const release = new Promise(resolve => { releaseTurn = resolve; });
    const assistant = createWorkflowAssistant({
        models: memory.models,
        db: { transaction: async callback => callback({}) },
        runTurn: async () => {
            generationStarted();
            await release;
            return { kind: 'reply', message: 'First request completed.' };
        }
    });

    const firstTurn = assistant.submitTurn({
        userId: 'user_1', workflowId: 'workflow_1', requestId: 'request_one', command: { type: 'submit_text', text: 'Add an email step.' }
    });
    await started;

    await assert.rejects(
        () => assistant.submitTurn({
            userId: 'user_1', workflowId: 'workflow_1', requestId: 'request_two', command: { type: 'submit_text', text: 'Add a delay step.' }
        }),
        error => error.code === 'WORKFLOW_AI_TURN_IN_PROGRESS'
    );

    releaseTurn();
    await firstTurn;
    assert.equal(memory.messages.length, 2);
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
