import test from 'node:test';
import assert from 'node:assert/strict';
import { workflowHealthSql } from './workflowController.js';

test('workflow health query exposes the latest-run timestamp from its subquery', () => {
    assert.match(workflowHealthSql, /SELECT "workflowId", status, "createdAt",\s*ROW_NUMBER\(\)/);
});
