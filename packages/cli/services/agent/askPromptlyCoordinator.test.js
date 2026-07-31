import assert from 'node:assert/strict';
import test from 'node:test';
import { createAskPromptlyCoordinator } from './askPromptlyCoordinator.js';

test('coordinator reports conversation routing without creating a work-specific contract', async () => {
    const events = [];
    const coordinator = createAskPromptlyCoordinator({
        classifyIntent: () => ({ goal: 'explain', domains: [] }),
        processAgenticTurn: async () => ({ handled: false })
    });
    const result = await coordinator.coordinate({ message: 'Who are you?', onEvent: event => events.push(event) });
    assert.equal(result.handled, false);
    assert.deepEqual(events[0], { type: 'turn.routed', route: 'conversation', domains: [], goal: 'explain' });
});

test('coordinator marks cross-resource changes as coordination before specialist work begins', async () => {
    const events = [];
    const coordinator = createAskPromptlyCoordinator({
        classifyIntent: () => ({ goal: 'create', domains: ['form', 'workflow'] }),
        processAgenticTurn: async () => ({ handled: true })
    });
    await coordinator.coordinate({ message: 'Build a form and workflow', onEvent: event => events.push(event) });
    assert.equal(events[0].route, 'coordination');
    assert.deepEqual(events[0].domains, ['form', 'workflow']);
});
