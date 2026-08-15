import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeOrigin } from './origin.js';

test('normalizes an origin and removes a trailing slash', () => {
    assert.equal(normalizeOrigin('https://example.com/', 'SITE_URL'), 'https://example.com');
    assert.equal(normalizeOrigin('http://localhost:5173', 'CLIENT_ORIGIN'), 'http://localhost:5173');
});

test('allows an empty optional origin', () => {
    assert.equal(normalizeOrigin('', 'TRIGGER_PUBLIC_ORIGIN'), null);
});

test('rejects non-origin URL values', () => {
    assert.throws(
        () => normalizeOrigin('https://example.com/api', 'SITE_URL'),
        /SITE_URL must contain only a scheme, host, and optional port/
    );
    assert.throws(
        () => normalizeOrigin('ftp://example.com', 'CLIENT_ORIGIN'),
        /CLIENT_ORIGIN must contain only a scheme, host, and optional port/
    );
});
