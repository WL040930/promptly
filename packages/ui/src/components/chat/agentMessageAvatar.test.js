import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

test('compact Promptly work keeps the assistant avatar while full proposal work owns its own presentation', async () => {
    const file = fileURLToPath(new URL('./AgentMessage.jsx', import.meta.url));
    const source = await readFile(file, 'utf8');

    assert.match(source, /message\.sender !== 'user' && !isProposalWork/);
});
