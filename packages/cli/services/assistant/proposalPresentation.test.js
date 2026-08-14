import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFormPresentation, buildWorkflowPresentation } from './proposalPresentation.js';

test('form presentation is grounded in patches rather than a generic AI summary', () => {
    const presentation = buildFormPresentation({
        form: { title: 'Customer Satisfaction Form' },
        proposal: { patches: [{ op: 'add', field: { id: 'rating', label: 'Overall satisfaction', type: 'rating' } }] }
    });
    assert.equal(presentation.title, 'Customer Satisfaction Form changes');
    assert.match(presentation.outcome, /Adds 1 item/);
    assert.deepEqual(presentation.changes[0], { id: 'patch_1', type: 'add', label: 'Overall satisfaction', detail: 'rating' });
});

test('form presentation describes an existing-field reorder with its anchor label', () => {
    const presentation = buildFormPresentation({
        form: { title: 'Event Registration' },
        proposal: {
            patches: [{
                op: 'move',
                id: 'special_req',
                label: 'Special Requirements',
                anchorLabel: 'Consent',
                insertBefore: 'f_consent'
            }]
        }
    });

    assert.deepEqual(presentation.changes[0], {
        id: 'patch_1',
        type: 'update',
        label: 'Special Requirements',
        detail: 'Reordered before Consent'
    });
});

test('workflow presentation derives visible changes and flow from the compiled graph', () => {
    const presentation = buildWorkflowPresentation({
        workflow: { name: 'Customer follow-up' },
        proposal: {
            diff: { addedNodes: [{ id: 'email', title: 'Send confirmation email' }], updatedNodes: [], removedNodes: [], edges: [{ op: 'connect' }] },
            nodes: [{ title: 'Form submitted' }, { title: 'Send confirmation email' }],
            readiness: { ready: true }
        }
    });
    assert.match(presentation.outcome, /adds 1 step/i);
    assert.deepEqual(presentation.flow, ['Form submitted', 'Send confirmation email']);
    assert.equal(presentation.changes.length, 2);
});

test('workflow presentation exposes a workflow rename as a visible change', () => {
    const presentation = buildWorkflowPresentation({
        workflow: { name: 'New Automation' },
        proposal: {
            diff: { metadata: { name: { from: 'New Automation', to: 'Event Registration Automation' } } },
            nodes: [],
            readiness: { ready: true }
        }
    });
    assert.match(presentation.outcome, /updates 1/i);
    assert.deepEqual(presentation.changes, [{ id: 'workflow_name', type: 'update', label: 'Workflow name', detail: 'Rename to Event Registration Automation' }]);
});

test('workflow presentation labels a provisioned response Sheet as a one-time resource, not a workflow step', () => {
    const presentation = buildWorkflowPresentation({
        workflow: { name: 'Event Registration' },
        proposal: {
            diff: {
                addedNodes: [
                    { id: 'form', title: 'Promptly Form' },
                    { id: 'append', title: 'Google Sheets Action' }
                ],
                updatedNodes: [],
                removedNodes: [],
                edges: [{ op: 'connect' }]
            },
            nodes: [{ title: 'Promptly Form' }, { title: 'Google Sheets Action' }],
            resourceChanges: [{ type: 'create_google_spreadsheet', ref: 'responses', title: 'Event Registration', sheetTitle: 'Responses' }],
            readiness: { ready: true }
        }
    });

    assert.match(presentation.outcome, /adds 2 steps/i);
    assert.match(presentation.outcome, /creates 1 Google Sheet once when you apply/i);
    assert.deepEqual(presentation.changes.at(-1), {
        id: 'resource_responses',
        type: 'provision',
        label: 'Event Registration',
        detail: 'Create once when you apply · Responses tab'
    });
    assert.deepEqual(presentation.flow, ['Promptly Form', 'Google Sheets Action']);
});
