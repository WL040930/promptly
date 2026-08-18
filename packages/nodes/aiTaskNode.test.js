import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('AI task node module imports after AI service reorganization', async () => {
    const module = await import('./ai-natural-language/text-understanding/ai-task/index.js');
    assert.equal(typeof module.default, 'function');
});

test('AI task prompt accepts workflow expressions for upstream input', async () => {
    const schema = JSON.parse(await readFile(new URL('./ai-natural-language/text-understanding/ai-task/schema.json', import.meta.url), 'utf8'));
    const prompt = schema.inputs.find(input => input.name === 'prompt');
    assert.equal(prompt?.valueSyntax, 'workflow-expression');
});

test('AI task prompt includes connected input alongside literal instructions', async () => {
    const module = await import('./ai-natural-language/text-understanding/ai-task/index.js');
    const prompt = module.buildPrompt('summarize', 'Summarize the feedback.', {}, [], 'The comments were negative.');
    assert.match(prompt, /Summarize the feedback\./);
    assert.match(prompt, /The comments were negative\./);
});

test('AI task recognizes an explicit workflow value in the prompt', async () => {
    const module = await import('./ai-natural-language/text-understanding/ai-task/index.js');
    assert.equal(module.promptUsesExplicitInput({
        $expr: 'reference',
        v: 1,
        nodeId: 'form_1',
        path: ['fields', 'comment']
    }), true);
    assert.equal(module.promptUsesExplicitInput('Summarize the feedback.'), false);
});
