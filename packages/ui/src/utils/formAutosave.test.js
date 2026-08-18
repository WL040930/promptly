import test from 'node:test';
import assert from 'node:assert/strict';
import { createDebouncedSaveQueue } from './formAutosave.js';

test('form autosave coalesces rapid edits into one latest save', async () => {
    const saved = [];
    const queue = createDebouncedSaveQueue({ delay: 5, save: update => saved.push(update) });
    queue.schedule({ title: 'H' });
    queue.schedule({ title: 'He' });
    queue.schedule({ title: 'Hello' });
    await queue.flush();
    assert.deepEqual(saved, [{ title: 'Hello' }]);
});

test('form autosave serializes a later edit behind an in-flight save', async () => {
    const saved = [];
    let resolveFirst;
    const firstSave = new Promise(resolve => { resolveFirst = resolve; });
    const queue = createDebouncedSaveQueue({
        delay: 5,
        save: async update => {
            saved.push(update);
            if (saved.length === 1) await firstSave;
        }
    });

    queue.schedule({ title: 'First' });
    await new Promise(resolve => setTimeout(resolve, 10));
    queue.schedule({ title: 'Second' });
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.deepEqual(saved, [{ title: 'First' }]);

    resolveFirst();
    await queue.flush();
    assert.deepEqual(saved, [{ title: 'First' }, { title: 'Second' }]);
});

test('form autosave reports background save errors', async () => {
    let reportedError;
    const queue = createDebouncedSaveQueue({
        delay: 5,
        save: async () => {
            throw new Error('Invalid workflow definition.');
        },
        onError: error => { reportedError = error; }
    });

    queue.schedule({ nodes: [] });
    await new Promise(resolve => setTimeout(resolve, 25));

    assert.equal(reportedError?.message, 'Invalid workflow definition.');
});
