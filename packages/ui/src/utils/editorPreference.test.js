import test from 'node:test';
import assert from 'node:assert/strict';
import { EDITOR_PREFERENCES, isEditorPreference } from './storage.js';

test('editor preferences accept the two supported opening choices', () => {
    assert.equal(isEditorPreference(EDITOR_PREFERENCES.AI), true);
    assert.equal(isEditorPreference(EDITOR_PREFERENCES.VISUAL), true);
    assert.equal(isEditorPreference('last_used'), false);
    assert.equal(isEditorPreference('canvas'), false);
});

test('AI is the safe default when no opening preference has been saved', () => {
    assert.equal(EDITOR_PREFERENCES.AI, 'ai');
});
