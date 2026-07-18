import test from 'node:test';
import assert from 'node:assert/strict';

test('AI task node module imports after AI service reorganization', async () => {
    const module = await import('./ai-natural-language/text-understanding/ai-task/index.js');
    assert.equal(typeof module.default, 'function');
});
