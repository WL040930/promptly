import test from 'node:test';
import assert from 'node:assert/strict';
import { findUnresolvedVariables, resolveVariables } from './contextParser.js';

test('unrooted form field tokens remain unresolved and are surfaced with their config path', () => {
    const fieldId = 'f_1785162183392_7owf';
    const context = { form_trigger_1: { fields: { [fieldId]: 'person@example.com' } } };
    const unresolved = resolveVariables(`{{fields.${fieldId}}}`, context);
    const resolved = resolveVariables(`{{form_trigger_1.fields.${fieldId}}}`, context);

    assert.equal(unresolved, `{{fields.${fieldId}}}`);
    assert.equal(resolved, 'person@example.com');
    assert.deepEqual(findUnresolvedVariables({ to: unresolved }), [{
        path: 'config.to', token: `{{fields.${fieldId}}}`, reference: `fields.${fieldId}`
    }]);
});
