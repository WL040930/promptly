import test from 'node:test';
import assert from 'node:assert/strict';
import { discoverResource } from './resourceDiscovery.js';

const options = [
    { value: 'sheet_a', label: 'Approved Event Registrations' },
    { value: 'sheet_b', label: 'Event Registrations Archive' }
];

test('selects one normalized exact Google Sheet name', () => {
    const result = discoverResource({ options, query: '  approved   event registrations ' });
    assert.equal(result.status, 'selected');
    assert.equal(result.option.value, 'sheet_a');
});

test('keeps partial Google Sheet names ambiguous', () => {
    const result = discoverResource({ options, query: 'event registrations' });
    assert.equal(result.status, 'ambiguous');
    assert.equal(result.options.length, 2);
});

test('reports an absent Google Sheet without inventing an ID', () => {
    assert.equal(discoverResource({ options, query: 'Payroll' }).status, 'missing');
});
