import assert from 'node:assert/strict';
import test from 'node:test';
import {
    FORM_AI_CONTEXT_LIMIT,
    FORM_AI_HISTORY_LIMIT,
    buildPlannerContext,
    compactFormSchema,
    createMemoryPatch,
    readFormMemory
} from './formContext.js';

test('buildPlannerContext keeps recent conversation bounded and separates memory', () => {
    const chatHistory = Array.from({ length: FORM_AI_HISTORY_LIMIT + 4 }, (_, index) => ({
        sender: index % 2 === 0 ? 'user' : 'bot',
        text: `message-${index}`
    }));

    const context = buildPlannerContext({
        schema: {
            title: 'Customer form',
            settings: {
                aiMemory: { version: 1, summary: 'Use a professional tone.' },
                accentColor: '#4f46e5'
            },
            fields: [{ id: 'f_name', type: 'text', label: 'Name' }]
        },
        chatHistory,
        prompt: 'Add an email field.'
    });

    assert.match(context, /Persistent Form Memory:\nUse a professional tone\./);
    assert.match(context, /Current Request:\nAdd an email field\./);
    assert.doesNotMatch(context, /message-0/);
    assert.match(context, /message-15/);
    assert.ok(context.length <= FORM_AI_CONTEXT_LIMIT + 2000);
    assert.doesNotMatch(JSON.stringify(compactFormSchema({ settings: { aiMemory: 'private' } })), /private/);
});

test('createMemoryPatch supports replacement, clearing, and legacy memory', () => {
    const schema = { settings: { aiMemory: 'Use short labels.' } };

    assert.deepEqual(readFormMemory(schema), { version: 1, summary: 'Use short labels.' });
    assert.deepEqual(createMemoryPatch(schema, {
        memoryUpdate: { action: 'replace', summary: 'Use a professional tone.' }
    }), {
        op: 'update_memory',
        updates: { memory: { version: 1, summary: 'Use a professional tone.' } },
        originalMemory: { version: 1, summary: 'Use short labels.' }
    });
    assert.deepEqual(createMemoryPatch(schema, { memoryUpdate: { action: 'clear' } }), {
        op: 'update_memory',
        updates: { memory: null },
        originalMemory: { version: 1, summary: 'Use short labels.' }
    });
});
