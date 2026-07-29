import test from 'node:test';
import assert from 'node:assert/strict';
import { choiceValues, clarificationState, textValue, updateChoiceValue } from './clarificationState.js';

test('clarification choice state tolerates legacy scalar and malformed values', () => {
    assert.deepEqual(choiceValues('Reduce questions'), ['Reduce questions']);
    assert.deepEqual(choiceValues({ selected: 'Reduce questions' }), []);
    assert.deepEqual(choiceValues(null), []);
    assert.deepEqual(clarificationState(null), {});
    assert.equal(textValue(['not text']), '');
});

test('checkbox and radio selections always produce safe array values', () => {
    assert.deepEqual(
        updateChoiceValue({ focus: 'Reduce questions' }, 'focus', 'Remove headings', false),
        { focus: ['Reduce questions', 'Remove headings'] }
    );
    assert.deepEqual(
        updateChoiceValue({ focus: { invalid: true } }, 'focus', 'Combine questions', true),
        { focus: ['Combine questions'] }
    );
});
