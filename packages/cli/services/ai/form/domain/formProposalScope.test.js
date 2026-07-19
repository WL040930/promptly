import test from 'node:test';
import assert from 'node:assert/strict';
import { validateFormProposalScope } from './formProposalScope.js';

test('heading-only intent rejects normal question additions', () => {
    const issues = validateFormProposalScope({
        scope: 'heading_only',
        patches: [
            { op: 'add', field: { id: 'heading_1', type: 'heading', label: 'Registration' } },
            { op: 'add', field: { id: 'meal', type: 'radio', label: 'Meal Preference', choices: ['Vegetarian', 'Standard'] } }
        ]
    });

    assert.deepEqual(issues, [{
        code: 'FORM_AI_SCOPE_VIOLATION',
        path: 'patches[1].field.type',
        message: 'A heading-only request may add heading fields only.'
    }]);
});
