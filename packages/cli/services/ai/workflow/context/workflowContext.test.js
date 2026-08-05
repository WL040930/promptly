import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWorkflowPlannerContext, buildWorkflowWorkerContext } from './workflowContext.js';

test('planner context keeps node routing information while excluding full schemas and proposal operations', () => {
    const result = buildWorkflowPlannerContext({
        workflow: {
            revision: 3,
            nodes: [{
                id: 'email_1',
                title: 'Send thank-you email',
                type: 'action',
                subType: 'email',
                nodeKey: 'action:email',
                position: { x: 100, y: 100 },
                config: { subject: 'Thank you', body: 'x'.repeat(600) }
            }],
            edges: []
        },
        catalogue: [{
            nodeKey: 'action:email',
            title: 'Send email',
            type: 'action',
            subType: 'email',
            description: 'Send a message to a recipient.',
            implementationStatus: 'experimental',
            inputs: [{ name: 'to', options: ['a', 'b'], resource: 'contacts' }],
            outputs: [{ name: 'done', isConnection: true }]
        }],
        history: Array.from({ length: 12 }, (_, index) => ({ sender: 'user', text: `Message ${index}` })),
        pendingProposal: {
            text: 'Pending email proposal',
            payload: {
                requirements: [{ id: 'req_1', description: 'Send a thank-you email.' }],
                operations: [{ op: 'add_node', huge: 'should not be included' }],
                diff: { addedNodes: [{ title: 'Send email' }], edges: [{ id: 'edge_1' }] }
            }
        },
        request: 'Send a thank-you email after submission.',
        clarificationMode: 'ask_when_needed'
    });

    assert.equal(typeof result.prompt, 'string');
    assert.equal(result.metrics.historyMessageCount, 10);
    assert.equal(result.metrics.pendingProposalIncluded, true);
    assert.match(result.prompt, /"nodeKey":"action:email"/);
    assert.doesNotMatch(result.prompt, /"inputs"/);
    assert.doesNotMatch(result.prompt, /should not be included/);
    assert.doesNotMatch(result.prompt, /"position"/);
    assert.ok(result.metrics.catalogueCharacters < 300, 'planner catalogue should remain routing-sized');
});

test('planner context keeps the attached form field metadata available for inspection', () => {
    const result = buildWorkflowPlannerContext({
        workflow: { revision: 1, nodes: [], edges: [] },
        catalogue: [],
        request: 'What fields are available in the selected form?',
        clarificationMode: 'ask_when_needed',
        userContext: { forms: [{ id: 'form_2', title: 'Other form', updatedAt: '2026-07-28' }] },
        formSchema: {
            id: 'form_1',
            title: 'Customer Satisfaction Survey',
            settings: { respondentEmailFieldId: 'field_email' },
            fields: [{ id: 'field_email', label: 'Email address', type: 'email', required: true }]
        }
    });

    assert.match(result.prompt, /Attached Form Context:[\s\S]*Email address/);
    assert.doesNotMatch(result.prompt, /Attached Form Context:[\s\S]*"fields":"\[details omitted\]"/);
    assert.equal(result.metrics.attachedFormFieldCount, 1);
});

test('worker context gives the model server-issued form field bindings', () => {
    const context = buildWorkflowWorkerContext({
        workflow: {
            nodes: [{ id: 'form_trigger_1', type: 'trigger', subType: 'form-submission', config: { formId: 'form_1' } }],
            edges: []
        },
        specs: [],
        requirements: [],
        capabilities: [],
        resourceContext: {},
        formSchema: {
            id: 'form_1',
            fields: [{ id: 'field_email', label: 'Email address', type: 'email' }]
        }
    });

    assert.match(context, /"key":"form_field_1"/);
    assert.match(context, /"fieldId":"field_email"/);
    assert.doesNotMatch(context, /semanticToken|runtimeToken|formField:/);
});

test('worker context makes empty-workflow refs and repair options explicit', () => {
    const context = buildWorkflowWorkerContext({
        workflow: { nodes: [], edges: [] },
        specs: [{
            nodeKey: 'trigger:webhook',
            type: 'trigger',
            subType: 'webhook',
            schema: { inputs: [], outputs: [{ name: 'event', isConnection: true }] }
        }, {
            nodeKey: 'action:email',
            type: 'action',
            subType: 'email',
            schema: { inputs: [{ name: 'event', isConnection: true }], outputs: [] }
        }],
        requirements: [{ id: 'req_1', description: 'Send an email.' }],
        linearSteps: [{ ref: 'webhook_trigger', nodeKey: 'trigger:webhook', requirementIds: ['req_1'], config: {} }],
        capabilities: [],
        resourceContext: {},
        priorResponse: { operations: [] },
        repairIssues: [{
            code: 'WORKFLOW_NODE_KEY_INVALID',
            path: 'operations[0].node.nodeKey',
            message: 'Unknown node key.',
            value: 'action:emails',
            allowed: ['action:email']
        }]
    });

    assert.match(context, /This workflow is empty/);
    assert.match(context, /no existing refs such as n1 or n2/i);
    assert.match(context, /"trigger:webhook"/);
    assert.match(context, /Provided value: "action:emails"/);
    assert.match(context, /Allowed values: action:email/);
});
