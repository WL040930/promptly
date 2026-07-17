import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRawMimeMessage, isRetryableEmailError, parseRecipients, validateEmailMessage, withRetries } from './integrations/generic-connectors/send-email/emailConnector.js';

test('email connector validates recipient lists and message headers', () => {
    assert.deepEqual(parseRecipients('a@example.com, b@example.com'), ['a@example.com', 'b@example.com']);
    assert.throws(() => parseRecipients('invalid-recipient'), /Invalid email recipient/);
    assert.throws(() => validateEmailMessage({ to: 'a@example.com', subject: 'bad\nsubject', text: 'x' }), /line breaks/);
});

test('email connector builds plain and HTML MIME messages safely', () => {
    const raw = buildRawMimeMessage({
        to: 'a@example.com',
        subject: 'Hello',
        bcc: 'audit@example.com',
        text: 'Plain body',
        html: '<p>HTML body</p>'
    });
    assert.match(raw, /multipart\/alternative/);
    assert.match(raw, /Bcc: audit@example\.com/);
    assert.match(raw, /Plain body/);
    assert.match(raw, /HTML body/);
});

test('email retry helper retries transient failures and stops on permanent failures', async () => {
    let attempts = 0;
    const result = await withRetries(async count => {
        attempts = count;
        if (count < 3) throw Object.assign(new Error('temporary'), { responseCode: 503 });
        return 'sent';
    }, { wait: () => Promise.resolve() });
    assert.equal(result.result, 'sent');
    assert.equal(attempts, 3);
    assert.equal(isRetryableEmailError({ responseCode: 400 }), false);
    assert.equal(isRetryableEmailError({ responseCode: 503 }), true);
});
