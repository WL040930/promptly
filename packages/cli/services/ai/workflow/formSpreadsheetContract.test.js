import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFormResponseSpreadsheetContract } from './formSpreadsheetContract.js';
import { deepResolve } from '../../../utils/contextParser.js';
import { validateValues } from '../../../../nodes/integrations/external-apps/google-sheets-action/googleSheetsConnector.js';

test('provisioned form-response sheets use one matching header and row contract', () => {
    const result = applyFormResponseSpreadsheetContract({
        form: { fields: [
            { id: 'name', label: 'Full Name', type: 'text' },
            { id: 'email', label: 'Email', type: 'email' },
            { id: 'heading', label: 'Ignore', type: 'heading' },
            { id: 'phone', label: 'Phone Number', type: 'text' },
            { id: 'diet', label: 'Dietary preferences', type: 'checkbox' }
        ] },
        resourceChanges: [{ type: 'create_google_spreadsheet', ref: 'responses' }],
        nodes: [
            { id: 'form', subType: 'form-submission', config: { formId: 'form_1' } },
            { id: 'sheet', subType: 'googleSheets', config: { spreadsheetId: { $provision: 'responses' }, values: [['wrong']] } }
        ]
    });
    assert.deepEqual(result.resourceChanges[0].headers, ['Submitted At', 'Response ID', 'Full Name', 'Email', 'Phone Number', 'Dietary preferences']);
    assert.deepEqual(result.nodes[1].config.values[0].map(value => value.path), [
        ['submittedAt'], ['responseId'], ['fields', 'name'], ['fields', 'email'], ['fields', 'phone'], ['fields', 'diet']
    ]);
    assert.equal(result.nodes[1].config.valueInputOption, 'RAW');
    const resolved = deepResolve(result.nodes[1].config.values, {
        form: {
            submittedAt: '2026-07-29T13:24:58.927Z',
            responseId: 'response_1',
            fields: {
                name: 'Lim Wei Lun',
                email: 'limweilun3838@gmail.com',
                phone: '123456789',
                diet: ['Vegetarian', 'Vegan']
            }
        }
    });
    assert.deepEqual(validateValues([result.resourceChanges[0].headers, ...resolved]), [[
        'Submitted At', 'Response ID', 'Full Name', 'Email', 'Phone Number', 'Dietary preferences'
    ], [
        '2026-07-29T13:24:58.927Z', 'response_1', 'Lim Wei Lun', 'limweilun3838@gmail.com', '123456789', 'Vegetarian, Vegan'
    ]]);
});

test('existing and non-form sheets are not rewritten', () => {
    const result = applyFormResponseSpreadsheetContract({
        form: { fields: [{ id: 'name', label: 'Name', type: 'text' }] },
        resourceChanges: [],
        nodes: [{ id: 'sheet', subType: 'googleSheets', config: { spreadsheetId: 'existing', values: [['keep']] } }]
    });
    assert.equal(result.applied, false);
    assert.deepEqual(result.nodes[0].config.values, [['keep']]);
});

test('runtime-created response sheets receive the matching header and row contract', () => {
    const result = applyFormResponseSpreadsheetContract({
        form: { fields: [{ id: 'name', label: 'Name', type: 'text' }] },
        nodes: [
            { id: 'form', subType: 'form-submission', config: {} },
            { id: 'create', subType: 'googleSheetsCreate', config: {} },
            { id: 'append', subType: 'googleSheets', config: { spreadsheetId: { $expr: 'reference', v: 1, nodeId: 'create', path: ['spreadsheetId'] } } }
        ]
    });
    assert.equal(result.applied, true);
    assert.deepEqual(result.nodes.find(node => node.id === 'create').config.headers, [['Submitted At', 'Response ID', 'Name']]);
    assert.equal(result.nodes.find(node => node.id === 'append').config.values[0].length, 3);
    assert.equal(result.nodes.find(node => node.id === 'append').config.valueInputOption, 'RAW');
});
