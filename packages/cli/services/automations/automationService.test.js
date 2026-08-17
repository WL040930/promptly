import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeWorkflowForWrite } from './automationService.js';

const source = {
    id: 'source_1',
    title: 'Source step',
    type: 'action',
    subType: 'source',
    schema: { inputs: [], outputs: [{ name: 'email', type: 'string' }] },
    config: {}
};

const targetSchema = {
    inputs: [{ name: 'to', type: 'text', valueSyntax: 'workflow-expression' }],
    outputs: []
};

const target = config => ({
    id: 'target_1',
    title: 'Send email',
    type: 'action',
    subType: 'email',
    schema: targetSchema,
    config
});

test('draft persistence canonicalizes a valid legacy workflow reference', async () => {
    const result = await normalizeWorkflowForWrite({
        nodes: [source, target({ to: '{{source_1.email}}' })],
        edges: [{ source: 'source_1', target: 'target_1' }],
        userId: 'user_1'
    });

    assert.deepEqual(result.nodes[1].config.to, {
        $expr: 'reference',
        v: 1,
        nodeId: 'source_1',
        path: ['email']
    });
});

test('draft persistence rejects an invalid legacy reference before writing', async () => {
    await assert.rejects(
        () => normalizeWorkflowForWrite({
            nodes: [source, target({ to: '{{missing.email}}' })],
            edges: [{ source: 'source_1', target: 'target_1' }],
            userId: 'user_1'
        }),
        error => error.code === 'AUTOMATION_WORKFLOW_REFERENCE_INVALID'
            && error.issues.some(issue => issue.code === 'WORKFLOW_REFERENCE_SOURCE_UNKNOWN')
    );
});

test('draft persistence rejects unsupported workflow interpolation before writing', async () => {
    await assert.rejects(
        () => normalizeWorkflowForWrite({
            nodes: [source, target({ to: '${steps.form_trigger.triggerData.f_email}' })],
            edges: [{ source: 'source_1', target: 'target_1' }],
            userId: 'user_1'
        }),
        error => error.code === 'AUTOMATION_WORKFLOW_REFERENCE_INVALID'
            && error.issues.some(issue => issue.code === 'WORKFLOW_REFERENCE_UNSUPPORTED_SYNTAX')
    );
});
