import test from 'node:test';
import assert from 'node:assert/strict';
import {
    ASSISTANT_TURN_OUTCOMES,
    outcomeForAssistantMessage
} from './assistantTurnNotification.js';

test('assistant notification outcomes distinguish clarification, review, reply, and failure', () => {
    assert.equal(outcomeForAssistantMessage({ kind: 'clarification' }), ASSISTANT_TURN_OUTCOMES.CLARIFICATION);
    assert.equal(outcomeForAssistantMessage({ kind: 'workflow_proposal' }), ASSISTANT_TURN_OUTCOMES.PROPOSAL);
    assert.equal(outcomeForAssistantMessage({ kind: 'agent_plan_review' }), ASSISTANT_TURN_OUTCOMES.PROPOSAL);
    assert.equal(outcomeForAssistantMessage({ kind: 'text' }), ASSISTANT_TURN_OUTCOMES.REPLY);
    assert.equal(outcomeForAssistantMessage({ kind: 'error', isError: true }), ASSISTANT_TURN_OUTCOMES.ERROR);
});

test('an explicit outcome wins over message-kind inference', () => {
    assert.equal(
        outcomeForAssistantMessage({ kind: 'text', outcome: ASSISTANT_TURN_OUTCOMES.CLARIFICATION }),
        ASSISTANT_TURN_OUTCOMES.CLARIFICATION
    );
});
