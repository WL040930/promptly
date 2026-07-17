import test from 'node:test';
import assert from 'node:assert/strict';
import { assertPublicUrl, isPrivateAddress, isRetryableStatus } from './integrations/generic-connectors/http-request/index.js';

test('HTTP node blocks private and reserved network addresses', () => {
    assert.equal(isPrivateAddress('127.0.0.1'), true);
    assert.equal(isPrivateAddress('10.0.0.4'), true);
    assert.equal(isPrivateAddress('::1'), true);
    assert.equal(isPrivateAddress('8.8.8.8'), false);
    assert.rejects(() => assertPublicUrl(new URL('http://127.0.0.1/test')), /private|local network/);
});

test('HTTP retry policy only retries transient statuses', () => {
    assert.equal(isRetryableStatus(429), true);
    assert.equal(isRetryableStatus(503), true);
    assert.equal(isRetryableStatus(400), false);
    assert.equal(isRetryableStatus(404), false);
});
