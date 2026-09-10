import test from 'node:test';
import assert from 'node:assert/strict';
import { compoundProposalPresentation, solutionArtifactFor } from './solutionProposalPresentation.js';
import { describeWorkflowVariable } from '../builder/utils/workflowVariableDisplay.js';

const proposal = {
    plan: {
        outcomes: [
            { id: 'form_solution', title: 'Create the form', artifactTypes: ['form_proposal'] },
            { id: 'workflow_solution', title: 'Create the workflow', artifactTypes: ['workflow_proposal'] }
        ]
    },
    solution: [
        {
            id: 'artifact_form',
            type: 'form_proposal',
            content: {
                action: 'create_form',
                schema: {
                    title: 'Contact form',
                    fields: [
                        { id: 'name', label: 'Name', type: 'short_text' },
                        { id: 'email', label: 'Email', type: 'email' }
                    ]
                }
            }
        },
        {
            id: 'artifact_workflow',
            type: 'workflow_proposal',
            content: {
                name: 'Save contact submissions',
                nodes: [
                    { id: 'trigger', title: 'Contact form', subType: 'form-submission', config: { formId: 'artifact:artifact_form' } },
                    { id: 'sheet', label: 'Append to Google Sheets' }
                ],
                edges: [{ source: 'trigger', target: 'sheet' }],
                resourceChanges: [{ id: 'sheet_1', type: 'create_google_spreadsheet', title: 'contact form and save every submission to a new', sheetTitle: 'Responses', detail: 'Single sheet for all submissions' }]
            }
        }
    ]
};

test('compound proposal presentation exposes separate form and workflow previews', () => {
    const result = compoundProposalPresentation(proposal);

    assert.equal(result.formTitle, 'Contact form');
    assert.deepEqual(result.formFields.map(field => field.label), ['Name', 'Email']);
    assert.equal(result.workflowTitle, 'Save contact submissions');
    assert.deepEqual(result.flow, ['Contact form', 'Append to Google Sheets']);
    assert.equal(result.resourceChanges[0].displayLabel, 'Create Google Sheet');
    assert.equal(result.resourceChanges[0].displayDetail, 'Tab: Responses · Single sheet for all submissions');
    assert.equal(solutionArtifactFor(proposal, 'workflow_proposal').name, 'Save contact submissions');
});

test('compound proposal presentation supports the form artifact spread onto the payload', () => {
    const result = compoundProposalPresentation({
        schema: { title: 'Existing form', fields: [{ id: 'message', label: 'Message', type: 'paragraph' }] },
        solution: [{ type: 'workflow_proposal', content: { nodes: [{ label: 'Send email' }], edges: [] } }]
    });

    assert.equal(result.formTitle, 'Existing form');
    assert.equal(result.formFields[0].label, 'Message');
    assert.deepEqual(result.flow, ['Send email']);
});

test('compound proposal workflow preview resolves fields from its sibling form artifact', () => {
    const productProposal = structuredClone(proposal);
    productProposal.solution[0].content.schema = {
        title: 'Product Feedback',
        fields: [
            { id: 'f_email_1', label: 'Email Address', type: 'email' },
            { id: 'f_rating_1', label: 'Product Rating', type: 'rating' }
        ]
    };
    productProposal.solution[1].content.nodes[0].title = 'Product Feedback';
    const result = compoundProposalPresentation(productProposal);
    const email = describeWorkflowVariable(
        'trigger.fields.f_email_1',
        result.workflowPreview.nodes,
        result.workflowPreview.previewFormsById
    );
    const rating = describeWorkflowVariable(
        'trigger.fields.f_rating_1',
        result.workflowPreview.nodes,
        result.workflowPreview.previewFormsById
    );

    assert.equal(email.displayLabel, 'Product Feedback › Email Address');
    assert.equal(rating.displayLabel, 'Product Feedback › Product Rating');
    assert.equal(email.isResolved, true);
    assert.equal(rating.isResolved, true);
});
