import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import NodeRegistry from '../../../../utils/NodeRegistry.js';
import {
    buildWorkflowPlannerContext,
    buildWorkflowWorkerContext,
    workflowContextInternals
} from './workflowContext.js';

const directory = path.dirname(fileURLToPath(import.meta.url));
const nodesDir = path.resolve(directory, '../../../../../nodes');
const plannerInstructionPath = path.resolve(directory, '../instruction/workflow-planner.md');

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
    assert.match(result.prompt, /"inputs":\[{"name":"to","resource":"contacts"}\]/);
    assert.doesNotMatch(result.prompt, /"configInputs"|"connectionOutputs"/);
    assert.doesNotMatch(result.prompt, /should not be included/);
    assert.doesNotMatch(result.prompt, /"position"/);
    assert.doesNotMatch(result.prompt, /Attached Form Context:|Inspected Form Context:|Available Owned Resources:/);
    assert.ok(result.metrics.catalogueCharacters < 500, 'planner catalogue should remain routing-sized');
    assert.ok(result.metrics.workflowCharacters > 0);
    assert.ok(result.metrics.historyCharacters > 0);
});

test('planner catalogue keeps every enabled node key in a compact routing contract', async () => {
    await NodeRegistry.init({ nodesDir });
    const rawCatalogue = NodeRegistry.getCompactCatalogue();
    const catalogue = workflowContextInternals.compactCatalogue(rawCatalogue);
    const email = catalogue.find(item => item.nodeKey === 'action:email');
    const approval = catalogue.find(item => item.nodeKey === 'logic:approval');

    assert.equal(catalogue.length, 26);
    assert.equal(catalogue.length, rawCatalogue.length);
    assert.ok(JSON.stringify(catalogue).length <= 6000);
    assert.deepEqual(Object.keys(email), ['nodeKey', 'title', 'purpose', 'inputs', 'outputs']);
    assert.ok(email.inputs.some(input => input.name === 'to'));
    assert.deepEqual(approval.outputs, ['approved', 'rejected']);
    assert.equal(Object.hasOwn(email, 'type'), false);
    assert.equal(Object.hasOwn(email, 'subType'), false);
});

test('representative planner prompt remains within the compact prompt budget', async () => {
    await NodeRegistry.init({ nodesDir });
    const instruction = await fs.readFile(plannerInstructionPath, 'utf8');
    const workflow = {
        revision: 4,
        nodes: Array.from({ length: 6 }, (_, index) => ({
            id: `node_${index + 1}`,
            nodeKey: index === 0 ? 'trigger:webhook' : 'action:email',
            type: index === 0 ? 'trigger' : 'action',
            subType: index === 0 ? 'webhook' : 'email',
            title: index === 0 ? 'Webhook' : `Email ${index}`,
            config: { subject: `Message ${index}`, body: 'x'.repeat(240) }
        })),
        edges: Array.from({ length: 5 }, (_, index) => ({
            id: `edge_${index + 1}`,
            source: `node_${index + 1}`,
            target: `node_${index + 2}`
        }))
    };
    const result = buildWorkflowPlannerContext({
        workflow,
        catalogue: NodeRegistry.getCompactCatalogue(),
        history: Array.from({ length: 10 }, (_, index) => ({ sender: 'user', text: `Message ${index}`.repeat(30) })),
        request: 'Add a confirmation email after the registration is saved.',
        clarificationMode: 'important_only'
    });

    assert.ok(instruction.length <= 4200, 'planner instruction should remain compact');
    assert.match(instruction, /untrusted data/);
    for (const outcome of ['reply', 'message', 'inspect_form', 'inspect_resource', 'resolve_resource', 'diagnose_run', 'direct_plan', 'plan_complete']) {
        assert.match(instruction, new RegExp(`\\\`${outcome}\\\``));
    }
    assert.ok(result.metrics.catalogueCharacters <= 6000, 'full enabled catalogue should remain compact');
    assert.ok(instruction.length + result.prompt.length <= 16000, 'representative planner prompt should remain bounded');
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

test('worker context removes legacy placeholder examples and states the structured reference contract', () => {
    const context = buildWorkflowWorkerContext({
        workflow: { nodes: [], edges: [] },
        specs: [{
            nodeKey: 'action:email',
            type: 'action',
            subType: 'email',
            schema: {
                inputs: [{
                    name: 'to',
                    type: 'text',
                    valueSyntax: 'workflow-expression',
                    placeholder: 'user@example.com or {{nodeId.email}}'
                }],
                outputs: []
            }
        }],
        requirements: [],
        capabilities: [],
        resourceContext: {}
    });

    assert.doesNotMatch(context, /nodeId\.email/);
    assert.match(context, /Workflow Reference Contract/);
    assert.match(context, /triggerData, inputData, and event are connection handles/);
});

test('worker context masks invalid interpolation values from the current workflow edit view', () => {
    const context = buildWorkflowWorkerContext({
        workflow: {
            nodes: [{
                id: 'form_trigger',
                type: 'trigger',
                subType: 'form-submission',
                nodeKey: 'trigger:form-submission',
                config: { formId: 'form_1' }
            }, {
                id: 'email_1',
                type: 'action',
                subType: 'email',
                nodeKey: 'action:email',
                config: { to: '${steps.form_trigger.triggerData.f_email}' }
            }],
            edges: [{ source: 'form_trigger', target: 'email_1' }]
        },
        specs: [{
            nodeKey: 'action:email',
            type: 'action',
            subType: 'email',
            schema: { inputs: [{ name: 'to', valueSyntax: 'workflow-expression' }], outputs: [] }
        }],
        requirements: [],
        capabilities: [],
        resourceContext: {}
    });

    assert.doesNotMatch(context, /steps\.form_trigger\.triggerData\.f_email/);
    assert.match(context, /invalid workflow reference/i);
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
