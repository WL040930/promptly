import assert from 'node:assert/strict';
import test from 'node:test';
import { recoverHistoricalFormContext } from './legacyFormContext.js';

const modifyingHistoricalForm = {
    route: 'agent',
    intent: {
        goal: 'modify',
        domains: ['form'],
        resourceReferences: [{ type: 'form', query: 'the form just now' }]
    }
};

test('recovers the one matching applied form from a legacy Ask Promptly thread', async () => {
    const context = await recoverHistoricalFormContext({
        threadId: 'thread_1',
        userId: 'user_1',
        context: {},
        decision: modifyingHistoricalForm,
        models: {
            AgentRun: {
                findAll: async () => [{
                    artifacts: [{ type: 'form_proposal', status: 'rejected', content: { schema: { title: 'New Form' } } }]
                }, {
                    artifacts: [{
                        type: 'form_proposal',
                        status: 'applied',
                        content: { formId: null, schema: { title: 'Untitled Form' } }
                    }]
                }]
            },
            Form: { findAll: async () => [{ id: 'form_recent' }] }
        }
    });

    assert.deepEqual(context, { formId: 'form_recent' });
});

test('does not guess when multiple historical forms have the same title', async () => {
    const context = await recoverHistoricalFormContext({
        threadId: 'thread_1',
        userId: 'user_1',
        context: { clarificationMode: 'ask_important' },
        decision: modifyingHistoricalForm,
        models: {
            AgentRun: {
                findAll: async () => [{
                    artifacts: [{
                        type: 'form_proposal',
                        status: 'applied',
                        content: { formId: null, schema: { title: 'Untitled Form' } }
                    }]
                }]
            },
            Form: { findAll: async () => [{ id: 'form_recent' }, { id: 'form_other' }] }
        }
    });

    assert.deepEqual(context, { clarificationMode: 'ask_important' });
});
