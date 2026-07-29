import test from 'node:test';
import assert from 'node:assert/strict';
import { pageAfterDeletingItem } from './paginationReconciliation.js';

test('deleting the only automation on a later page returns to the previous page', () => {
    assert.equal(pageAfterDeletingItem({ page: 2, itemCount: 1 }), 1);
    assert.equal(pageAfterDeletingItem({ page: 3, itemCount: 1 }), 2);
});

test('deleting from a populated page keeps the user on that page', () => {
    assert.equal(pageAfterDeletingItem({ page: 2, itemCount: 2 }), 2);
    assert.equal(pageAfterDeletingItem({ page: 1, itemCount: 1 }), 1);
});
