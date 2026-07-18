import assert from 'node:assert/strict';
import test from 'node:test';
import {
    FORM_AI_CONTEXT_LIMIT,
    FORM_AI_HISTORY_LIMIT,
    buildVerifierContext,
    buildVerifierRepairContext,
    buildPlannerContext,
    compactFormSchema,
    createMemoryPatch,
    getActiveQuestionCount,
    getMemoryUpdate,
    getQuestionCardinality,
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
        prompt: 'Add an email field.',
        clarificationMode: 'important_only'
    });

    assert.match(context, /Persistent Form Memory:\nUse a professional tone\./);
    assert.match(context, /Current Request:\nAdd an email field\./);
    assert.match(context, /Clarification:\nimportant_only - Ask only high-impact questions; infer low-risk details\./);
    assert.doesNotMatch(context, /message-0/);
    assert.match(context, /message-9/);
    assert.ok(context.length <= FORM_AI_CONTEXT_LIMIT + 2000);
    assert.doesNotMatch(JSON.stringify(compactFormSchema({ settings: { aiMemory: 'private' } })), /private/);
    assert.doesNotMatch(JSON.stringify(compactFormSchema({ id: 'form_1', settings: {} })), /form_1/);
    const compact = compactFormSchema({
        title: 'A'.repeat(400),
        description: 'B'.repeat(1400),
        settings: { accentColor: '#fff', acceptingResponses: true },
        fields: [{
            id: 'email',
            type: 'email',
            label: 'Email',
            required: true,
            internalNotes: 'drop this',
            description: 'C'.repeat(500),
            choices: ['One']
        }]
    });
    assert.equal(compact.title.length, 255);
    assert.equal(compact.description.length, 1000);
    assert.equal(compact.settings.acceptingResponses, true);
    assert.equal(compact.settings.accentColor, undefined);
    assert.equal(compact.fields[0].internalNotes, undefined);
    assert.equal(compact.fields[0].description.length, 300);
    assert.deepEqual(compact.fields[0].choices, ['One']);
});

test('question cardinality distinguishes final totals from additions and keeps clarification context', () => {
    const schema = {
        fields: [
            { id: 'q1', type: 'text', label: 'Question 1' },
            { id: 'heading', type: 'heading', label: 'Section' },
            { id: 'hidden', type: 'hidden', label: 'Internal value' },
            { id: 'deleted', type: 'text', label: 'Removed', deleted: true }
        ]
    };

    assert.equal(getActiveQuestionCount(schema), 1);
    assert.deepEqual(getQuestionCardinality({ schema, prompt: 'I need a total of 10 questions.' }), {
        mode: 'total_questions',
        targetCount: 10,
        currentCount: 1,
        additionalCount: 9
    });
    assert.deepEqual(getQuestionCardinality({ schema, prompt: 'Please add 3 new questions.' }), {
        mode: 'add_questions',
        targetCount: 4,
        currentCount: 1,
        additionalCount: 3
    });
    assert.deepEqual(getQuestionCardinality({
        schema,
        prompt: 'Use email fields.',
        chatHistory: [{ sender: 'user', text: 'Create a survey with a total of 5 questions.' }]
    }), {
        mode: 'total_questions',
        targetCount: 5,
        currentCount: 1,
        additionalCount: 4
    });
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

test('empty or unchanged memory proposals do not create selectable patches', () => {
    assert.deepEqual(getMemoryUpdate({
        memoryUpdate: { action: 'replace', summary: 'No durable form-specific rules have been set.' }
    }), { action: 'none' });
    assert.deepEqual(getMemoryUpdate({
        memoryUpdate: { action: 'replace', summary: 'No durable rules defined.' }
    }), { action: 'none' });
    assert.equal(readFormMemory({ settings: { aiMemory: { summary: 'No durable rules defined.' } } }), null);
    assert.equal(createMemoryPatch({ settings: {} }, { memoryUpdate: { action: 'clear' } }), null);
    assert.equal(createMemoryPatch({ settings: { aiMemory: { version: 1, summary: 'Use short labels.' } } }, {
        memoryUpdate: { action: 'replace', summary: 'Use short labels.' }
    }), null);
});

test('buildVerifierContext keeps planner-approved memory changes in scope', () => {
    const context = buildVerifierContext({
        requirements: [{ id: 'req_1', description: 'Use a professional tone.' }],
        memoryUpdate: { action: 'replace', summary: 'Use a professional tone.' },
        patches: [{
            op: 'update_memory',
            updates: { memory: { version: 1, summary: 'Use a professional tone.' } }
        }]
    });

    assert.match(context, /Planner-approved Memory Update:/);
    assert.match(context, /Treat this approved memory update as in scope/);
    assert.match(context, /Use a professional tone\./);
});

test('buildVerifierRepairContext preserves the proposal while explaining the JSON failure', () => {
    const context = buildVerifierRepairContext({
        requirements: [{ id: 'req_1', description: 'Add an email field.' }],
        patches: [{ op: 'add', field: { id: 'email', type: 'email', label: 'Email' } }],
        response: '{"status":"pass"',
        issues: 'INVALID_JSON at response: Unexpected end of JSON input'
    });

    assert.match(context, /Do not change the generated patches or planner requirements/);
    assert.match(context, /INVALID_JSON/);
    assert.match(context, /Invalid Verifier Response:/);
    assert.match(context, /email/);
});

test('buildVerifierContext keeps omitted update properties omitted', () => {
    const context = buildVerifierContext({
        requirements: [{ id: 'req_1', description: 'Make the email field required.' }],
        patches: [{
            op: 'update',
            id: 'email',
            updates: { required: true }
        }]
    });

    assert.match(context, /"updates":\{"required":true\}/);
    assert.doesNotMatch(context, /"updates":\{"label":""/);
});

test('buildVerifierContext preserves an explicitly cleared update label', () => {
    const context = buildVerifierContext({
        requirements: [{ id: 'req_1', description: 'Make the email field required.' }],
        patches: [{
            op: 'update',
            id: 'email',
            updates: { required: true, label: '' }
        }]
    });

    assert.match(context, /"updates":\{"label":"","required":true\}/);
});
