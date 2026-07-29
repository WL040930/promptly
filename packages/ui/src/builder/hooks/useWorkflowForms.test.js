import test from 'node:test';
import assert from 'node:assert/strict';
import { workflowFormIds } from '../utils/workflowFormIds.js';

test('workflow form loading targets the full schema for each linked form trigger', () => {
    assert.deepEqual(workflowFormIds([
        { id: 'form_a', subType: 'form-submission', config: { formId: 'form_registration' } },
        { id: 'email_a', subType: 'email', config: {} },
        { id: 'form_b', subType: 'form-submission', config: { formId: 'form_registration' } }
    ]), ['form_registration']);
});
