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
