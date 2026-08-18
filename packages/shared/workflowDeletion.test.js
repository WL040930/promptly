import test from 'node:test';
import assert from 'node:assert/strict';
import {
    planDanglingWorkflowReferenceRepair,
    planWorkflowNodeDeletion
} from './workflowDeletion.js';

const schemaForNode = node => node?.schema || {};

const trigger = {
    id: 'trigger_1',
    title: 'Form submitted',
    type: 'trigger',
    subType: 'form-submission',
    schema: { inputs: [], outputs: [{ name: 'triggerData', isConnection: true }] },
    config: {}
};

const summary = {
    id: 'summary_1',
    title: 'Summarize feedback',
    type: 'ai',
    subType: 'aiTask',
    schema: {
        inputs: [{ name: 'inputData', isConnection: true }],
        outputs: [{ name: 'outputData', isConnection: true }, { name: 'response' }]
    },
    config: {}
};

const email = config => ({
    id: 'email_1',
    title: 'Send email',
    type: 'action',
    subType: 'email',
    schema: {
        inputs: [
            { name: 'event', isConnection: true },
            { name: 'body', type: 'textarea', valueSyntax: 'workflow-expression', defaultValue: '' }
        ],
        outputs: []
    },
    config
});

const reference = {
    $expr: 'reference',
    v: 1,
    nodeId: 'summary_1',
    path: ['response']
};

test('deleting a referenced middle node clears the value and safely bypasses the flow', () => {
    const result = planWorkflowNodeDeletion({
        nodes: [trigger, summary, email({ body: reference })],
        edges: [
            { id: 'edge_in', source: 'trigger_1', sourceHandle: 'triggerData', target: 'summary_1', targetHandle: 'inputData' },
            { id: 'edge_out', source: 'summary_1', sourceHandle: 'outputData', target: 'email_1', targetHandle: 'event' }
        ],
        nodeIds: ['summary_1'],
        schemaForNode
    });

    assert.equal(result.canApply, true);
    assert.equal(result.impact.clearedReferences.length, 1);
    assert.equal(result.impact.bypassedEdges.length, 1);
    assert.equal(result.nodes.length, 2);
    assert.equal(result.nodes.find(node => node.id === 'email_1').config.body, '');
    assert.deepEqual(result.edges.map(edge => [edge.source, edge.target]), [['trigger_1', 'email_1']]);
});

test('deleting a node removes references from mixed templates and nested values', () => {
    const valuesNode = {
        ...email({
            body: {
                $expr: 'template',
                v: 1,
                parts: [{ text: 'Summary: ' }, { reference }, { text: '!' }]
            },
            values: [[reference]]
        }),
        schema: {
            inputs: [
                { name: 'event', isConnection: true },
                { name: 'body', type: 'textarea', valueSyntax: 'workflow-expression' },
                { name: 'values', type: 'data-grid', valueSyntax: 'workflow-expression' }
            ],
            outputs: []
        }
    };

    const result = planWorkflowNodeDeletion({
        nodes: [trigger, summary, valuesNode],
        edges: [{ id: 'edge', source: 'summary_1', target: 'email_1' }],
        nodeIds: ['summary_1'],
        schemaForNode
    });

    assert.equal(result.impact.clearedReferences.length, 2);
    assert.deepEqual(result.nodes.find(node => node.id === 'email_1').config.body, {
        $expr: 'template',
        v: 1,
        parts: [{ text: 'Summary: ' }, { text: '!' }]
    });
    assert.deepEqual(result.nodes.find(node => node.id === 'email_1').config.values, [['']]);
});

test('deleting a node removes legacy template tokens while preserving literal text', () => {
    const legacyEmail = {
        ...email({ body: 'Summary: {{summary_1.response}}.' }),
        schema: {
            inputs: [{ name: 'body', type: 'textarea', valueSyntax: 'node-template', defaultValue: '' }],
            outputs: []
        }
    };
    const result = planWorkflowNodeDeletion({
        nodes: [{ ...summary, title: 'Summary' }, legacyEmail],
        edges: [],
        nodeIds: ['summary_1'],
        schemaForNode
    });

    assert.equal(result.canApply, true);
    assert.equal(result.nodes.find(node => node.id === 'email_1').config.body, 'Summary: .');
    assert.equal(result.impact.clearedReferences[0].kind, 'legacy-reference');
});

test('ambiguous legacy titles block deletion instead of guessing a source', () => {
    const firstSummary = { ...summary, id: 'summary_1', title: 'Summary' };
    const secondSummary = { ...summary, id: 'summary_2', title: 'Summary' };
    const legacyEmail = {
        ...email({ body: 'Summary: {{Summary.response}}' }),
        schema: {
            inputs: [{ name: 'body', type: 'textarea', valueSyntax: 'node-template', defaultValue: '' }],
            outputs: []
        }
    };
    const result = planWorkflowNodeDeletion({
        nodes: [firstSummary, secondSummary, legacyEmail],
        edges: [],
        nodeIds: ['summary_1'],
        schemaForNode
    });

    assert.equal(result.canApply, false);
    assert.equal(result.nodes.find(node => node.id === 'email_1').config.body, 'Summary: {{Summary.response}}');
    assert.equal(result.impact.blockedReferences.length, 1);
});

test('deleting a node clears node-select references without guessing a replacement', () => {
    const catcher = {
        id: 'catch_1',
        title: 'Catch errors',
        type: 'logic',
        subType: 'catchError',
        schema: {
            inputs: [{ name: 'errorSource', type: 'node-select', defaultValue: '' }],
            outputs: []
        },
        config: { errorSource: 'summary_1' }
    };

    const result = planWorkflowNodeDeletion({
        nodes: [summary, catcher],
        edges: [],
        nodeIds: ['summary_1'],
        schemaForNode
    });

    assert.equal(result.impact.clearedReferences.length, 1);
    assert.equal(result.nodes.find(node => node.id === 'catch_1').config.errorSource, '');
});

test('deleting a fan-out node removes routes without inventing a bypass', () => {
    const branch = {
        ...summary,
        schema: {
            inputs: [{ name: 'inputData', isConnection: true }],
            outputs: [{ name: 'left', isConnection: true }, { name: 'right', isConnection: true }]
        }
    };
    const result = planWorkflowNodeDeletion({
        nodes: [trigger, branch, email({})],
        edges: [
            { id: 'in', source: 'trigger_1', target: 'summary_1' },
            { id: 'left', source: 'summary_1', sourceHandle: 'left', target: 'email_1' },
            { id: 'right', source: 'summary_1', sourceHandle: 'right', target: 'email_1' }
        ],
        nodeIds: ['summary_1'],
        schemaForNode
    });

    assert.equal(result.impact.bypassedEdges.length, 0);
    assert.equal(result.edges.length, 0);
});

test('dangling reference repair clears missing sources without changing topology', () => {
    const result = planDanglingWorkflowReferenceRepair({
        nodes: [email({ body: reference })],
        edges: [],
        schemaForNode
    });

    assert.equal(result.canApply, true);
    assert.equal(result.impact.recovery, true);
    assert.equal(result.nodes[0].config.body, '');
    assert.deepEqual(result.edges, []);
});
