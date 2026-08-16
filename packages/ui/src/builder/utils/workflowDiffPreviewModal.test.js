import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const sourceUrl = new URL('../components/modals/WorkflowDiffPreviewModal.jsx', import.meta.url);

test('workflow proposal preview treats a missing saved workflow as an empty baseline', async () => {
    const source = await readFile(sourceUrl, 'utf8');

    assert.doesNotMatch(source, /if \(!currentWorkflow \|\| !versionWorkflow\) return \[\];/);
    assert.match(source, /currentNodes:\s*currentWorkflow\?\.nodes\s*\|\|\s*\[\]/);
});
