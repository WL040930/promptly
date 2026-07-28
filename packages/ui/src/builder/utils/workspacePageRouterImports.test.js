import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

test('WorkspacePageRouter declares ChatTab before rendering the assistant route', async () => {
    const file = fileURLToPath(new URL('../../workspace/WorkspacePageRouter.jsx', import.meta.url));
    const source = await readFile(file, 'utf8');

    assert.match(source, /const ChatTab = React\.lazy\(\(\) => import\('\.\.\/chat\/components\/ChatTab\.jsx'\)\);/);
});
