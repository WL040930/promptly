import test from 'node:test';
import assert from 'node:assert/strict';
import {
    buildIndividualRowMessages,
    buildRawMimeMessage,
    isRetryableEmailError,
    parseRecipients,
    validateEmailMessage,
    withRetries
} from './integrations/generic-connectors/send-email/emailConnector.js';

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

test('Send Email defaults to durable asynchronous delivery and exposes queue outputs', async () => {
    const schema = (await import('./integrations/generic-connectors/send-email/schema.json', { with: { type: 'json' } })).default;
    const deliveryMode = schema.inputs.find(input => input.name === 'deliveryMode');
    assert.equal(deliveryMode.defaultValue, 'async');
    assert.deepEqual(deliveryMode.options.map(option => option.value), ['async', 'wait']);
    const recipientMode = schema.inputs.find(input => input.name === 'recipientMode');
    assert.equal(recipientMode.defaultValue, 'group');
    assert.deepEqual(recipientMode.options.map(option => option.value), ['group', 'individualRows']);
    assert.deepEqual(schema.outputs.filter(output => ['deliveryId', 'deliveryStatus'].includes(output.name)).map(output => output.name), ['deliveryId', 'deliveryStatus']);
});

test('email validation accepts normalized async messages with empty optional recipient arrays', () => {
    const normalized = validateEmailMessage({
        to: ['member@example.com'],
        cc: [],
        bcc: [],
        replyTo: [],
        subject: 'Welcome',
        text: 'Hello',
        html: ''
    });
    assert.deepEqual(normalized.to, ['member@example.com']);
    assert.deepEqual(normalized.cc, []);
    assert.deepEqual(normalized.bcc, []);
    assert.deepEqual(normalized.replyTo, []);
});

test('individual row emails render a private message per unique recipient', () => {
    const result = buildIndividualRowMessages({
        rows: [
            { Email: 'ada@example.com', Name: 'Ada', Status: '<Active>' },
            { Email: 'ADA@example.com', Name: 'Duplicate', Status: 'Inactive' },
            { Email: 'bea@example.com', Name: 'Bea', Status: 'Active' }
        ],
        recipientColumn: 'email',
        subject: 'Hi [[Name]]',
        text: 'Status: [[Status]]',
        html: '<p>Status: [[Status]]</p>'
    });

    assert.equal(result.recipientCount, 2);
    assert.equal(result.skippedDuplicates, 1);
    assert.deepEqual(result.messages[0], {
        to: ['ada@example.com'],
        cc: [],
        bcc: [],
        replyTo: [],
        subject: 'Hi Ada',
        text: 'Status: <Active>',
        html: '<p>Status: &lt;Active&gt;</p>'
    });
    assert.equal(result.messages[1].subject, 'Hi Bea');
});

test('individual row emails validate template columns before delivery can be queued', () => {
    assert.throws(() => buildIndividualRowMessages({
        rows: [{ Email: 'ada@example.com', Name: 'Ada' }],
        recipientColumn: 'Email',
        subject: 'Hi [[Missing]]',
        text: 'Hello'
    }), /missing column 'Missing'/);
});
