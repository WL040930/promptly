import test from 'node:test';
import assert from 'node:assert/strict';
import { assistantWorkStatus, assistantWorkStatusLabel } from '../components/chat/assistantWorkPresentation.js';

test('clarification message kind repairs a historical completed work status at presentation time', () => {
    assert.equal(assistantWorkStatus({ work: { status: 'completed' }, messageKind: 'clarification' }), 'needs_input');
    assert.equal(assistantWorkStatusLabel('needs_input'), 'Needs clarification');
});

test('proposal and ordinary terminal statuses keep distinct labels', () => {
    assert.equal(assistantWorkStatusLabel('awaiting_review'), 'Ready to review');
    assert.equal(assistantWorkStatusLabel('completed'), 'Completed');
});
