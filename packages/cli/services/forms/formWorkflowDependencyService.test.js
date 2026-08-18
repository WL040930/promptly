import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFormChange, previewFormChange } from './formWorkflowDependencyService.js';

const transaction = { LOCK: { UPDATE: 'UPDATE', SHARE: 'SHARE' } };

const formTrigger = formId => ({
    id: 'trigger_1',
    title: 'Form submitted',
    type: 'trigger',
    subType: 'form-submission',
    config: { formId },
    schema: { inputs: [], outputs: [] }
});

const emailNode = body => ({
    id: 'email_1',
    title: 'Send email',
    type: 'action',
    subType: 'email',
    config: { body },
    schema: {
        inputs: [{ name: 'body', type: 'textarea', valueSyntax: 'workflow-expression', defaultValue: '' }],
        outputs: []
    }
});

const makeForm = fields => {
    const data = {
        id: 'form_1',
        userId: 'user_1',
        title: 'Registration',
        description: '',
        settings: {},
        fields,
        updatedAt: '2026-08-18T00:00:00.000Z'
    };
    const form = {
        ...data,
        toJSON: () => ({ ...data, fields: data.fields.map(field => ({ ...field })) }),
        async update(patch) {
            Object.assign(data, patch);
            Object.assign(form, patch);
            return form;
        }
    };
    return form;
};

const makeModels = ({ form, workflows = [], versions = [] }) => ({
    Form: { findOne: async () => form },
    Workflow: { findAll: async () => workflows },
    WorkflowVersion: { findAll: async () => versions }
});

const deletedSchema = () => ({
    id: 'form_1',
    title: 'Registration',
    description: '',
    settings: {},
    fields: [
        { id: 'f_deleted', label: 'Attendance', type: 'text', deleted: true },
        { id: 'f_keep', label: 'Name', type: 'text' }
    ]
});

const currentFields = [
    { id: 'f_deleted', label: 'Attendance', type: 'text' },
    { id: 'f_keep', label: 'Name', type: 'text' }
];

const deletedReference = {
    $expr: 'reference',
    v: 1,
    nodeId: 'trigger_1',
    path: ['fields', 'f_deleted']
};

test('preview reports draft references before a form field is deleted', async () => {
    const form = makeForm(currentFields);
    const workflow = {
        id: 'workflow_1',
        name: 'Notify registrants',
        revision: 7,
        isActive: false,
        publishedRevisionId: null,
        nodes: [formTrigger('form_1'), emailNode(deletedReference)],
        edges: []
    };
    const result = await previewFormChange({
        formId: 'form_1',
        userId: 'user_1',
        nextSchema: deletedSchema(),
        models: makeModels({ form, workflows: [workflow] }),
        nodeRegistry: { getDefinition: () => null }
    });

    assert.equal(result.requiresReview, true);
    assert.equal(result.canApply, true);
    assert.equal(result.affectedWorkflows[0].draft.references[0].fieldLabel, 'Attendance');
    assert.deepEqual(result.workflowRevisions, { workflow_1: 7 });
});

test('confirmed deletion updates the form and repairs the affected draft atomically', async () => {
    const form = makeForm(currentFields);
    const workflow = {
        id: 'workflow_1',
        name: 'Notify registrants',
        revision: 7,
        isActive: false,
        publishedRevisionId: null,
        nodes: [formTrigger('form_1'), emailNode(deletedReference)],
        edges: []
    };
    let savedDraft = null;
    const result = await applyFormChange({
        formId: 'form_1',
        userId: 'user_1',
        nextSchema: deletedSchema(),
        expectedFormUpdatedAt: form.updatedAt,
        workflowRevisions: { workflow_1: 7 },
        reviewConfirmed: true,
        transaction,
        models: makeModels({ form, workflows: [workflow] }),
        nodeRegistry: { getDefinition: () => null },
        saveDraft: async draft => {
            savedDraft = draft;
            return { automation: { revision: 8 } };
        }
    });

    assert.equal(form.fields.find(field => field.id === 'f_deleted').deleted, true);
    assert.equal(savedDraft.nodes[1].config.body, '');
    assert.equal(result.workflowChanges[0].revision, 8);
    assert.equal(result.workflowChanges[0].clearedReferences[0].fieldId, 'f_deleted');
});

test('confirmed deletion is blocked when an active published release still uses the field', async () => {
    const form = makeForm(currentFields);
    const workflow = {
        id: 'workflow_1',
        name: 'Live notification',
        revision: 7,
        isActive: true,
        publishedRevisionId: 'version_1',
        nodes: [formTrigger('form_1')],
        edges: []
    };
    const published = {
        id: 'version_1',
        nodes: [formTrigger('form_1'), emailNode(deletedReference)],
        edges: []
    };

    await assert.rejects(
        () => applyFormChange({
            formId: 'form_1',
            userId: 'user_1',
            nextSchema: deletedSchema(),
            expectedFormUpdatedAt: form.updatedAt,
            workflowRevisions: { workflow_1: 7 },
            reviewConfirmed: true,
            transaction,
            models: makeModels({ form, workflows: [workflow], versions: [published] }),
            nodeRegistry: { getDefinition: () => null },
            saveDraft: async () => ({ automation: { revision: 8 } })
        }),
        error => error.code === 'FORM_FIELD_DELETION_LIVE_DEPENDENCY'
            && error.preview?.liveBlockers?.[0]?.workflowId === 'workflow_1'
    );
    assert.equal(form.fields.find(field => field.id === 'f_deleted').deleted, undefined);
});
