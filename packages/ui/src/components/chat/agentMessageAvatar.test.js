import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

test('all assistant work variants keep the external assistant avatar', async () => {
    const file = fileURLToPath(new URL('./AgentMessage.jsx', import.meta.url));
    const source = await readFile(file, 'utf8');

    assert.match(source, /message\.sender !== 'user' && \(\s*<div className="w-8 h-8/);
    assert.doesNotMatch(source, /message\.sender !== 'user' && !isProposalWork/);
});
