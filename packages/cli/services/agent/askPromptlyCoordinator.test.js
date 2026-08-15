import assert from 'node:assert/strict';
import test from 'node:test';
import { createAskPromptlyCoordinator } from './askPromptlyCoordinator.js';

test('coordinator reports conversation routing without creating a work-specific contract', async () => {
    const events = [];
    const coordinator = createAskPromptlyCoordinator({
        decideIntent: async () => ({ route: 'conversation', intent: { goal: 'explain', domains: [] } }),
        processAgenticTurn: async () => ({ handled: false })
    });
    const result = await coordinator.coordinate({ message: 'Who are you?', onEvent: event => events.push(event) });
    assert.equal(result.handled, false);
    assert.deepEqual(events[0], { type: 'turn.routed', route: 'conversation', domains: [], goal: 'explain', confidence: null });
});

test('coordinator marks cross-resource changes as coordination before specialist work begins', async () => {
    const events = [];
    const coordinator = createAskPromptlyCoordinator({
        decideIntent: async () => ({ route: 'agent', confidence: 0.95, intent: { goal: 'create', domains: ['form', 'workflow'] } }),
        processAgenticTurn: async ({ decision }) => {
            assert.equal(decision.route, 'agent');
            return { handled: true };
        }
    });
    await coordinator.coordinate({ message: 'Build a form and workflow', onEvent: event => events.push(event) });
    assert.equal(events[0].route, 'agent');
    assert.deepEqual(events[0].domains, ['form', 'workflow']);
});

test('coordinator carries a recovered historical form into the next agent turn', async () => {
    const coordinator = createAskPromptlyCoordinator({
        decideIntent: async () => ({
            route: 'agent',
            confidence: 0.95,
            intent: { goal: 'modify', domains: ['form'], resourceReferences: [{ type: 'form', query: 'the form just now' }] }
        }),
        recoverContext: async ({ context }) => ({ ...context, formId: 'form_recent' }),
        processAgenticTurn: async ({ context }) => {
            assert.equal(context.formId, 'form_recent');
            return { handled: true };
        }
    });

    await coordinator.coordinate({ message: 'Update the form just now', context: {} });
});
