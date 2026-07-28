import test from 'node:test';
import assert from 'node:assert/strict';
import { workflowAIHistoryQueryPolicy } from './workflowAIHistoryPolicy.js';

test('workflow AI history always reconciles after its editor panel remounts', () => {
    assert.equal(workflowAIHistoryQueryPolicy.staleTime, 0);
    assert.equal(workflowAIHistoryQueryPolicy.refetchOnMount, 'always');
});
