import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgentCapabilityRegistry } from './agentCapabilityRegistry.js';
import { AgentRuntimeError, createAgentRuntime } from './agentRuntime.js';

test('capability registry exposes a stable tool surface and rejects duplicates', async () => {
    const registry = createAgentCapabilityRegistry([{
        name: 'read_form',
        description: 'Read a form.',
        risk: 'read',
        inputSchema: {
            type: 'object',
            properties: { formId: { type: 'string' } },
            required: ['formId'],
            additionalProperties: false
        },
        execute: async ({ args }) => ({ status: 'completed', output: args.formId })
    }]);

    assert.equal(registry.has('read_form'), true);
    assert.equal(registry.toToolDefinitions()[0].function.name, 'read_form');
    assert.equal(await registry.execute('read_form', { formId: 'form_1' }).then(result => result.output), 'form_1');
    assert.throws(() => registry.register({ name: 'read_form', execute: async () => ({}) }), /already registered/);
    await assert.rejects(() => registry.execute('missing'), error => error.code === 'AGENT_UNKNOWN_CAPABILITY');
});

test('runtime executes ready steps in dependency order and returns approval state', async () => {
    const order = [];
    const registry = createAgentCapabilityRegistry([
        { name: 'research', execute: async () => { order.push('research'); return { output: { found: true } }; } },
        { name: 'design', execute: async ({ context }) => { order.push(context.state.outputs.research.found ? 'design' : 'bad'); return { output: { proposalId: 'p1' } }; } },
        { name: 'verify', execute: async () => { order.push('verify'); return { output: { pass: true } }; }
    }]);
    const runtime = createAgentRuntime({
        registry,
        planner: {
            plan: async () => ({
                summary: 'Build',
                steps: [
                    { id: 'research', type: 'research' },
                    { id: 'design', type: 'design', dependsOn: ['research'] },
                    { id: 'verify', type: 'verify', dependsOn: ['design'] }
                ]
            })
        }
    });

    const result = await runtime.run({ input: { request: 'build it' } });
    assert.equal(result.status, 'awaiting_approval');
    assert.deepEqual(order, ['research', 'design', 'verify']);
    assert.equal(result.state.outputs.design.proposalId, 'p1');
    assert.equal(result.actionCount, 3);
});

test('runtime stops at clarification without running dependent actions', async () => {
    const order = [];
    const registry = createAgentCapabilityRegistry([
        { name: 'clarify', execute: async () => { order.push('clarify'); return { status: 'awaiting_clarification', message: 'Need a title.' }; } },
        { name: 'apply', execute: async () => { order.push('apply'); return {}; } }
    ]);
    const runtime = createAgentRuntime({
        registry,
        planner: { plan: async () => ({ steps: [{ id: 'clarify', type: 'clarify' }, { id: 'apply', type: 'apply', dependsOn: ['clarify'] }] }) }
    });

    const result = await runtime.run();
    assert.equal(result.status, 'awaiting_clarification');
    assert.deepEqual(order, ['clarify']);
    assert.equal(result.plan.steps[1].status, 'pending');
});

test('runtime replans a bounded number of times and fails closed after the limit', async () => {
    let attempts = 0;
    const registry = createAgentCapabilityRegistry([
        { name: 'unstable', execute: async () => ({ status: 'replan', message: 'The observation changed.' }) }
    ]);
    const runtime = createAgentRuntime({
        registry,
        limits: { maxActions: 3, maxReplans: 1 },
        planner: {
            plan: async () => ({ steps: [{ id: 'unstable', type: 'unstable' }] }),
            replan: async () => {
                attempts += 1;
                return { steps: [{ id: `unstable_${attempts}`, type: 'unstable' }] };
            }
        }
    });

    await assert.rejects(() => runtime.run(), error => {
        assert.ok(error instanceof AgentRuntimeError);
        return error.code === 'AGENT_REPLAN_LIMIT_EXCEEDED';
    });
    assert.equal(attempts, 1);
});

test('runtime rejects deadlocked plans instead of spinning', async () => {
    const registry = createAgentCapabilityRegistry([{ name: 'step', execute: async () => ({}) }]);
    const runtime = createAgentRuntime({
        registry,
        planner: { plan: async () => ({ steps: [{ id: 'a', type: 'step', dependsOn: ['b'] }, { id: 'b', type: 'step', dependsOn: ['a'] }] }) }
    });

    await assert.rejects(() => runtime.run(), error => error.code === 'AGENT_PLAN_DEADLOCK');
});

test('runtime emits the shared dotted progress event contract', async () => {
    const events = [];
    const registry = createAgentCapabilityRegistry([{ name: 'step', execute: async () => ({}) }]);
    const runtime = createAgentRuntime({
        registry,
        planner: { plan: async () => ({ steps: [{ id: 'step', type: 'step' }] }) },
        onEvent: event => events.push(event.type)
    });
    await runtime.run();
    assert.deepEqual(events, ['step.started', 'step.completed']);
});
