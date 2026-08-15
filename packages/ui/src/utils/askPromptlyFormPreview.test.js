import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const sourceUrl = new URL('../chat/components/ChatTab.jsx', import.meta.url);

test('Ask Promptly closes a form preview only after its proposal applies', async () => {
    const source = await readFile(sourceUrl, 'utf8');

    assert.match(source, /const applied = await handleApply\(message, previewProposal\);/);
    assert.match(source, /if \(applied\) setPreviewProposal\(null\);/);
});

test('Ask Promptly gives feedback when a preview no longer has a proposal message', async () => {
    const source = await readFile(sourceUrl, 'utf8');

    assert.match(source, /This proposal is no longer available\. Refresh and try again\./);
});

test('Ask Promptly preserves the selected form patches when approval begins from chat', async () => {
    const source = await readFile(sourceUrl, 'utf8');

    assert.match(source, /handleApply=\{\(msg, formSelection, selectedPatchIds\)/);
    assert.match(source, /handleApply\(msg, formSelection, selectedPatchIds\)/);
});

test('Ask Promptly keeps the proposal message ID while its preview selection changes', async () => {
    const source = await readFile(sourceUrl, 'utf8');

    assert.match(source, /prev\.messageId === option\.proposal\.messageId/);
});
