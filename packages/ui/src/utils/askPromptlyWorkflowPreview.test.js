import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const sourceUrl = new URL('../chat/components/ChatTab.jsx', import.meta.url);

test('Ask Promptly opens a reviewable workflow preview instead of sending the preview event as chat text', async () => {
    const source = await readFile(sourceUrl, 'utf8');

    assert.match(source, /if \(option\?\.type === 'preview_workflow'\) \{\s*setWorkflowPreviewProposal\(option\.proposal\);\s*return;/);
    assert.match(source, /<WorkflowDiffPreviewModal/);
});

test('Ask Promptly applies the workflow message selected in its preview', async () => {
    const source = await readFile(sourceUrl, 'utf8');

    assert.match(source, /const message = messages\.find\(item => item\.id === workflowPreviewProposal\?\.messageId\);/);
    assert.match(source, /const applied = await handleApply\(message\);/);
});
