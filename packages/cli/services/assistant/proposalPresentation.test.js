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
