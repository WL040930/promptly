import test from 'node:test';
import assert from 'node:assert/strict';
import {
    getNodeDefaultConfig,
    getVisibleNodeInputs,
    normalizeNodeInputOptions,
    normalizeNodeResourceValue,
    resetDependentNodeInputs,
    resolveNodeResourceParams,
    validateNodeConfig
} from './nodeConfigContract.js';

const schema = {
    inputs: [
        { name: 'operation', type: 'select', defaultValue: 'read', options: ['read', 'update'] },
        { name: 'recordId', type: 'resource-select', label: 'Record', requiredWhen: { field: 'operation', equals: 'update' }, showWhen: { field: 'operation', equals: 'update' } },
        { name: 'data', type: 'key-value', label: 'Fields', defaultValue: {}, showWhen: { field: 'operation', equals: 'update' } },
        { name: 'mode', type: 'select', optionsBy: { field: 'operation', values: { read: ['formatted'], update: ['raw'] } } }
    ]
};

test('node config contract resolves defaults, conditional inputs, and dependent resource params', () => {
    assert.deepEqual(getNodeDefaultConfig(schema), { operation: 'read', data: {} });
    assert.deepEqual(getVisibleNodeInputs(schema, { operation: 'read' }).map(input => input.name), ['operation', 'mode']);
    assert.deepEqual(getVisibleNodeInputs(schema, { operation: 'update' }).map(input => input.name), ['operation', 'recordId', 'data', 'mode']);
    assert.deepEqual(resolveNodeResourceParams({ resourceParams: { resource: '$resource', fixed: 'value' } }, { resource: 'forms' }), { resource: 'forms', fixed: 'value' });
    assert.equal(normalizeNodeResourceValue('google-spreadsheet-id', 'https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit'), '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789');
});

test('node config contract validates only relevant fields and distinguishes drafts from runnable config', () => {
    const draft = validateNodeConfig({ schema, config: { operation: 'update', data: {} }, mode: 'draft' });
    assert.equal(draft.valid, true);
    assert.equal(draft.ready, false);
    assert.deepEqual(draft.issues.map(item => [item.field, item.severity]), [['recordId', 'warning']]);

    const active = validateNodeConfig({ schema, config: { operation: 'update', data: 'not-json' }, mode: 'active' });
    assert.equal(active.valid, false);
    assert.deepEqual(new Set(active.issues.map(item => item.code)), new Set(['MISSING_REQUIRED_CONFIG', 'INVALID_JSON']));
});

test('node config contract filters dynamic options and rejects unsupported selections', () => {
    const input = schema.inputs.find(item => item.name === 'mode');
    assert.deepEqual(normalizeNodeInputOptions(input, { operation: 'read' }).map(option => option.value), ['formatted']);
    const result = validateNodeConfig({ schema, config: { operation: 'read', mode: 'raw' }, mode: 'active' });
    assert.equal(result.valid, false);
    assert.equal(result.issues[0].code, 'INVALID_OPTION');
});

test('node config contract clears stale dependent selections when a parent changes', () => {
    const dependentSchema = {
        inputs: [
            { name: 'spreadsheetId', type: 'resource-select', resource: 'google-spreadsheets' },
            { name: 'range', type: 'resource-select', resource: 'google-sheet-ranges', resourceParams: { spreadsheetId: '$spreadsheetId' } }
        ]
    };
    assert.deepEqual(resetDependentNodeInputs(dependentSchema, {
        spreadsheetId: 'sheet_a',
        range: 'Sheet A!A1:B2'
    }, 'spreadsheetId'), {
        spreadsheetId: 'sheet_a'
    });
});

test('Google Sheets Create headers are a flat text list while append values remain a row grid', async () => {
    const createSchema = (await import('../nodes/integrations/external-apps/google-sheets-create-action/schema.json', { with: { type: 'json' } })).default;
    const appendSchema = (await import('../nodes/integrations/external-apps/google-sheets-action/schema.json', { with: { type: 'json' } })).default;

    const createResult = validateNodeConfig({
        schema: createSchema,
        config: { title: 'Event Registration', sheetTitle: 'Responses', headers: ['Name', 'Email'] },
        mode: 'active'
    });
    assert.equal(createResult.valid, true);

    const appendResult = validateNodeConfig({
        schema: appendSchema,
        config: {
            spreadsheetId: 'sheet_123',
            range: "'Responses'!A1",
            operation: 'append',
            values: ['Name', 'Email']
        },
        mode: 'active'
    });
    assert.equal(appendResult.valid, false);
    assert.equal(appendResult.issues.some(issue => issue.code === 'INVALID_DATA_GRID'), true);
});
