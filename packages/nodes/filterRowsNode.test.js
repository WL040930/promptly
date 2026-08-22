import test from 'node:test';
import assert from 'node:assert/strict';
import FilterRowsNode, { filterRows, normalizeFilters } from './core-logic/data-manipulation/filter-rows/index.js';

test('filter rows normalizes a Google Sheets table and applies AND conditions case-insensitively', () => {
    const result = filterRows({
        rows: {
            response: {
                values: [
                    ['Email', 'Status', 'Spend'],
                    ['ada@example.com', 'Active', '120'],
                    ['bea@example.com', 'active', '80'],
                    ['cy@example.com', 'Paused', '140']
                ]
            }
        },
        filters: [
            { column: 'Status', operator: 'equals', value: 'ACTIVE' },
            { column: 'Spend', operator: 'greater', value: 100 }
        ]
    });

    assert.equal(result.totalCount, 3);
    assert.equal(result.matchedCount, 1);
    assert.deepEqual(result.rows, [{ Email: 'ada@example.com', Status: 'Active', Spend: '120' }]);
});

test('filter rows supports empty checks and reports invalid filters without throwing from a node', async () => {
    assert.deepEqual(normalizeFilters([{ column: 'Email', operator: 'isEmpty' }]), [{ column: 'Email', operator: 'isEmpty' }]);
    const node = new FilterRowsNode('filter_1', 'logic', 'filterRows', { filters: [{ column: 'Status', operator: 'bogus' }] });
    const result = await node.execute({ initialPayload: { rows: [] }, __runtime: { inputs: { filter_1: { inputData: [{ Status: 'Active' }] } } } });
    assert.equal(result.success, false);
    assert.equal(result.errorCode, 'FILTER_ROWS_FAILED');
});
