import test from 'node:test';
import assert from 'node:assert/strict';
import { formatApiErrorMessage } from './errorMessage.js';

test('API error messages include workflow validation issue paths', () => {
    const message = formatApiErrorMessage({
        message: 'Invalid workflow definition.',
        issues: [{
            path: 'nodes[4].config.prompt',
            message: 'Structured workflow expressions are not allowed for this input.'
        }]
    });

    assert.equal(
        message,
        'Invalid workflow definition. nodes[4].config.prompt: Structured workflow expressions are not allowed for this input.'
    );
});

test('API error messages preserve the fallback when no issues are present', () => {
    assert.equal(formatApiErrorMessage({ message: 'Request failed.' }), 'Request failed.');
});
