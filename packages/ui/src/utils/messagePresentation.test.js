import test from 'node:test';
import assert from 'node:assert/strict';
import { messagePresentation } from '../components/chat/messagePresentation.js';

test('completed work metadata does not turn Form AI replies into draft cards', () => {
    assert.equal(messagePresentation({
        sender: 'bot', kind: 'text', payload: { work: { surface: 'form', status: 'completed' } }
    }), 'message');
});

test('clarifications keep their input treatment even when they retain work metadata', () => {
    assert.equal(messagePresentation({
        sender: 'bot', kind: 'clarification', payload: { work: { surface: 'form', status: 'needs_input' } }
    }), 'clarification');
});

test('only active assistant-work messages retain the compact progress treatment', () => {
    assert.equal(messagePresentation({ sender: 'bot', kind: 'assistant_work', payload: { work: { surface: 'form' } } }), 'work');
    assert.equal(messagePresentation({ sender: 'bot', kind: 'assistant_work', payload: { work: { surface: 'form', outcomeKind: 'reply' } } }), 'work');
    assert.equal(messagePresentation({ sender: 'bot', kind: 'assistant_work', payload: { work: { surface: 'form', outcomeKind: 'clarification' } } }), 'work');
    assert.equal(messagePresentation({ sender: 'bot', kind: 'text', payload: { work: { surface: 'workflow', status: 'completed' } } }), 'message');
});

test('active work expands only after the planner identifies a proposal outcome', () => {
    assert.equal(messagePresentation({
        sender: 'bot', kind: 'assistant_work', payload: { work: { surface: 'workflow', outcomeKind: 'proposal' } }
    }), 'proposal_work');
});

test('Ask Promptly coordinator work uses the detailed run presentation from the first real run event', () => {
    assert.equal(messagePresentation({
        sender: 'bot', kind: 'assistant_work', payload: { work: { surface: 'ask_promptly' } }
    }), 'proposal_work');
});
