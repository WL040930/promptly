import test from 'node:test';
import assert from 'node:assert/strict';
import {
    materializePendingFormProposal,
    rebaseFormProposalSchema,
    rebaseFormProposalRevision
} from './formProposalRevision.js';
import { applyFormPatches } from './formPatchEngine.js';

const savedForm = {
    id: 'form_1',
    title: 'Contact Form',
    description: '',
    settings: {},
    fields: [
        { id: 'name', type: 'text', label: 'Name' },
        { id: 'email', type: 'email', label: 'Email', required: true },
        { id: 'message', type: 'textarea', label: 'Message' }
    ]
};

const pendingProposal = {
    messageId: 'proposal_1',
    baseFormUpdatedAt: '2026-08-13T00:00:00.000Z',
    patches: [
        { op: 'add', field: { id: 'f_phone_1', type: 'phone', label: 'Phone' } },
        { op: 'add', field: { id: 'f_company_1', type: 'text', label: 'Company' } },
        { op: 'add', field: { id: 'f_job_title_1', type: 'text', label: 'Job Title' } }
    ]
};

test('revises a pending proposal against its draft and returns patches relative to the saved form', () => {
    const draft = materializePendingFormProposal({ currentSchema: savedForm, proposal: pendingProposal });
    assert.deepEqual(draft.schema.fields.map(field => field.id), [
        'name', 'email', 'message', 'f_phone_1', 'f_company_1', 'f_job_title_1'
    ]);

    const revision = rebaseFormProposalRevision({
        currentSchema: savedForm,
        draftSchema: draft.schema,
        revisionPatches: [{ op: 'remove', id: 'f_company_1' }]
    });

    assert.deepEqual(revision.schema.fields.map(field => field.id), [
        'name', 'email', 'message', 'f_phone_1', 'f_job_title_1'
    ]);
    assert.deepEqual(revision.patches.map(patch => [patch.op, patch.field?.id || patch.id]), [
        ['add', 'f_phone_1'],
        ['add', 'f_job_title_1']
    ]);
    assert.deepEqual(
        applyFormPatches({ currentSchema: savedForm, patches: revision.patches }).schema,
        revision.schema
    );
});

test('folds an update to a pending field into the final add patch', () => {
    const draft = materializePendingFormProposal({ currentSchema: savedForm, proposal: pendingProposal });
    const revision = rebaseFormProposalRevision({
        currentSchema: savedForm,
        draftSchema: draft.schema,
        revisionPatches: [{ op: 'update', id: 'f_job_title_1', updates: { required: true } }]
    });

    const jobTitle = revision.patches.find(patch => patch.field?.id === 'f_job_title_1');
    assert.equal(jobTitle.op, 'add');
    assert.equal(jobTitle.field.required, true);
});

test('returns no patches when a revision cancels every pending change', () => {
    const draft = materializePendingFormProposal({ currentSchema: savedForm, proposal: pendingProposal });
    const revision = rebaseFormProposalRevision({
        currentSchema: savedForm,
        draftSchema: draft.schema,
        revisionPatches: pendingProposal.patches.map(patch => ({ op: 'remove', id: patch.field.id }))
    });

    assert.deepEqual(revision.patches, []);
    assert.deepEqual(revision.schema, savedForm);
});

test('rebases a retained-field reorder as a move patch', () => {
    const currentSchema = {
        ...savedForm,
        fields: [
            { id: 'name', type: 'text', label: 'Name' },
            { id: 'consent', type: 'checkbox', label: 'Consent', choices: ['Yes'] },
            { id: 'special_req', type: 'textarea', label: 'Special Requirements' }
        ]
    };
    const targetSchema = {
        ...currentSchema,
        fields: [
            currentSchema.fields[0],
            currentSchema.fields[2],
            currentSchema.fields[1]
        ]
    };

    const result = rebaseFormProposalSchema({ currentSchema, targetSchema });

    assert.deepEqual(result.patches.map(patch => [patch.op, patch.id]), [['move', 'special_req']]);
    assert.equal(result.patches[0].insertBefore, 'consent');
    assert.deepEqual(result.schema, targetSchema);
});

test('rebases a reorder without disturbing soft-deleted field placement', () => {
    const currentSchema = {
        title: 'Event Registration',
        description: '',
        settings: {},
        fields: [
            { id: 'name', type: 'text', label: 'Name' },
            { id: 'legacy', type: 'text', label: 'Legacy', deleted: true },
            { id: 'attendance', type: 'select', label: 'Attendance', choices: ['Physical', 'Online'] },
            { id: 'consent', type: 'checkbox', label: 'Consent', choices: ['Yes'] }
        ]
    };
    const targetSchema = applyFormPatches({
        currentSchema,
        patches: [{ op: 'move', id: 'name', insertAfter: 'consent' }]
    }).schema;

    const result = rebaseFormProposalSchema({ currentSchema, targetSchema });

    assert.deepEqual(result.schema.fields.filter(field => !field.deleted).map(field => field.id), ['attendance', 'consent', 'name']);
    assert.deepEqual(result.schema.fields.filter(field => field.deleted).map(field => field.id), ['legacy']);
    assert.deepEqual(result.schema.fields.find(field => field.id === 'legacy'), currentSchema.fields[1]);
    assert.deepEqual(result.schema.fields.find(field => field.id === 'name'), currentSchema.fields[0]);
});
