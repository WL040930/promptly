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
    assert.equal(events[0].type, 'plan.ready');
    assert.equal(events.at(-1).type, 'turn.completed');
    assert.equal(events.at(-1).result.reply.kind, 'agent_plan_review');
    assert.equal(events.at(-1).result.reply.payload.runId, 'run_1');
});
