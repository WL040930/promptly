import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeLogCursor, encodeLogCursor } from './logController.js';

test('execution log cursor round-trips a deterministic keyset boundary', () => {
    const cursor = encodeLogCursor({
        id: 'run_123',
        createdAt: new Date('2026-07-28T12:34:56.000Z')
    });
    assert.deepEqual(decodeLogCursor(cursor), {
        id: 'run_123',
        createdAt: new Date('2026-07-28T12:34:56.000Z')
    });
});

test('execution log cursor rejects malformed values', () => {
    assert.equal(decodeLogCursor('not-a-cursor'), null);
    assert.equal(decodeLogCursor(''), null);
});
