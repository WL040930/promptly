import test from 'node:test';
import assert from 'node:assert/strict';
import { createSendMessageHandler } from './chatController.js';

const responseRecorder = () => {
    const response = {
        writableEnded: false,
        statusCode: 200,
        headers: {},
        chunks: [],
        body: null,
        setHeader(name, value) {
            this.headers[name] = value;
        },
        flushHeaders() {},
        write(chunk) {
            this.chunks.push(chunk);
        },
        end() {
            this.writableEnded = true;
        },
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(value) {
            this.body = value;
            this.writableEnded = true;
        }
    };
    return response;
};

test('assistant turn SSE exposes a reviewable plan result through the API boundary', async () => {
    const persistedMessages = [];
    const messageModel = {
        async create(value) {
            const message = {
                ...value,
                id: value.id || `message_${persistedMessages.length + 1}`,
                async update(patch) { Object.assign(this, patch); return this; }
            };
            persistedMessages.push(message);
            return message;
        },
        async findOne({ where }) {
            return persistedMessages.find(message => Object.entries(where || {}).every(([key, value]) => message[key] === value)) || null;
        }
    };
    const session = {
        id: 'session_1',
        agentContext: {},
        async update(updates) {
            Object.assign(this, updates);
        }
    };
    const response = responseRecorder();
    const handler = createSendMessageHandler({
        chatSessionModel: {
            findOne: async () => null,
            create: async () => session
        },
        assistantMessageModel: messageModel,
        saveUserMessageService: async () => ({ id: 'user_message', sender: 'user', text: 'Create a form workflow.' }),
        processChatMessageService: async ({ onEvent }) => {
            onEvent({ type: 'plan.ready', runId: 'run_1' });
            return {
                replyObj: {
                    id: 'plan_message',
                    sender: 'bot',
                    kind: 'agent_plan_review',
                    text: 'I prepared a plan for review.',
                    payload: {
                        runId: 'run_1',
                        plan: { steps: [{ id: 'design_form', type: 'design_form' }] }
                    }
                },
                totalTokenUsage: {}
            };
        }
    });

    await handler({
        body: { message: 'Create a form workflow.' },
        headers: { accept: 'text/event-stream' },
        user: { id: 'user_1' }
    }, response, error => { throw error; });

    const events = response.chunks
        .join('')
        .split('\n\n')
        .filter(Boolean)
        .map(chunk => JSON.parse(chunk.replace(/^data: /, '')));
    assert.equal(response.headers['Content-Type'], 'text/event-stream');
    assert.equal(events[0].type, 'turn.started');
    assert.ok(events.some(event => event.type === 'plan.ready'));
    assert.ok(events.some(event => event.type === 'run.progress' && event.work));
    assert.equal(events.at(-1).type, 'turn.completed');
    assert.equal(events.at(-1).result.reply.kind, 'agent_plan_review');
    assert.equal(events.at(-1).result.reply.payload.runId, 'run_1');
});

test('assistant clarification events return the resolved card so the browser closes it immediately', async () => {
    const response = responseRecorder();
    const persistedMessages = [];
    const session = {
        id: 'session_1',
        state: {},
        context: {},
        async update(updates) {
            Object.assign(this, updates);
            return this;
        }
    };
    const resolvedClarification = {
        id: 'clarification_1',
        sender: 'bot',
        kind: 'clarification',
        payload: {
            inputs: [{ id: 'createSpreadsheet', type: 'resource_choice', options: [{ id: 'create', name: 'Create a new Sheet' }] }],
            selectedState: { createSpreadsheet: 'create' },
            resolution: { type: 'answered', answers: [{ id: 'createSpreadsheet', label: 'Destination', answer: 'Create a new Sheet' }] }
        }
    };
    const handler = createSendMessageHandler({
        chatSessionModel: {
            findOne: async () => session,
            create: async () => session
        },
        applyEventService: async () => ({
            reply: { id: 'reply_1', sender: 'bot', kind: 'workflow_proposal', text: 'Ready.' },
            tokenUsage: {},
            clarification: resolvedClarification
        }),
        assistantMessageModel: {
            async create(value) {
                const message = {
                    ...value,
                    id: value.id || `message_${persistedMessages.length + 1}`,
                    async update(patch) {
                        Object.assign(this, patch);
                        return this;
                    }
                };
                persistedMessages.push(message);
                return message;
            },
            async findOne({ where }) {
                return persistedMessages.find(message => Object.entries(where || {}).every(([key, value]) => message[key] === value)) || null;
            },
            update: async () => {}
        }
    });

    await handler({
        body: { sessionId: 'session_1', event: { type: 'submit_clarification', state: { createSpreadsheet: 'create' } } },
        headers: { accept: 'application/json' },
        user: { id: 'user_1' }
    }, response, error => { throw error; });

    assert.equal(response.body.clarification.id, 'clarification_1');
    assert.equal(response.body.clarification.payload.resolution.type, 'answered');
    assert.equal(response.body.reply.kind, 'workflow_proposal');
    assert.equal(persistedMessages.filter(message => message.kind === 'assistant_work').length, 1);
});
