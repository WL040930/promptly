import sequelize from '../../db/index.js';
import { Form as DefaultForm, Workflow as DefaultWorkflow, WorkflowVersion as DefaultWorkflowVersion } from '../../models/index.js';
import NodeRegistry from '../../utils/NodeRegistry.js';
import { validateFormSchema } from '../ai/form/domain/formSchemaValidator.js';
import { saveAutomationDraft } from '../automations/automationService.js';
import { planFormFieldChange } from '../../../shared/workflowDeletion.js';

const defaultModels = { Form: DefaultForm, Workflow: DefaultWorkflow, WorkflowVersion: DefaultWorkflowVersion };

const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));

const formChangeError = (code, message, status = 409, preview = null) => {
    const error = new Error(message);
    error.code = code;
    error.status = status;
    if (preview) error.preview = preview;
    return error;
};

const formNotFound = () => formChangeError('FORM_NOT_FOUND', 'Form not found.', 404);

const nextSchemaFor = (form, nextSchema = null) => ({
    ...form.toJSON(),
    ...(nextSchema || {}),
    id: form.id,
    title: nextSchema?.title ?? form.title,
    description: nextSchema?.description ?? form.description ?? '',
    settings: nextSchema?.settings ?? form.settings ?? {},
    fields: nextSchema?.fields ?? form.fields ?? []
});

const validateNextSchema = schema => {
    const issues = validateFormSchema(schema);
    if (issues.length === 0) return;
    const error = formChangeError('FORM_SCHEMA_INVALID', 'Invalid form schema.', 400);
    error.issues = issues;
    throw error;
};

const publishedVersionMap = async ({ workflows, transaction, models }) => {
    const ids = (workflows || []).map(workflow => workflow?.publishedRevisionId).filter(Boolean);
    if (ids.length === 0) return new Map();
    const WorkflowVersion = (models || defaultModels).WorkflowVersion;
    if (!WorkflowVersion) return new Map();
    const versions = await WorkflowVersion.findAll({
        where: { id: [...new Set(ids)] },
        transaction
    });
    return new Map(versions.map(version => [version.id, version]));
};

const workflowSnapshots = async ({ workflows, transaction, models }) => {
    const versions = await publishedVersionMap({ workflows, transaction, models });
    return (workflows || []).map(workflow => {
        const published = versions.get(workflow.publishedRevisionId);
        return {
            id: workflow.id,
            name: workflow.name,
            isActive: workflow.isActive === true,
            revision: workflow.revision,
            nodes: clone(workflow.nodes || []),
            edges: clone(workflow.edges || []),
            published: published
                ? { nodes: clone(published.nodes || []), edges: clone(published.edges || []) }
                : null
        };
    });
};

const publicReference = item => ({
    nodeId: item.nodeId,
    title: item.title,
    configPath: item.configPath,
    valuePath: item.valuePath,
    fieldId: item.fieldId || null,
    fieldLabel: item.fieldLabel || null,
    required: item.required === true,
    kind: item.kind
});

const publicPlan = plan => ({
    formId: plan.formId,
    removedFieldIds: plan.removedFieldIds,
    requiresReview: plan.requiresReview,
    canApply: plan.canApply,
    blockers: plan.blockers,
    liveBlockers: plan.liveBlockers.map(item => ({
        workflowId: item.workflowId,
        workflowName: item.workflowName,
        revision: item.revision,
        isActive: item.isActive,
        references: (item.published?.impact?.clearedReferences || []).map(publicReference),
        blockedReferences: (item.published?.impact?.blockedReferences || []).map(publicReference)
    })),
    affectedWorkflows: plan.affectedWorkflows.map(item => ({
        workflowId: item.workflowId,
        workflowName: item.workflowName,
        revision: item.revision,
        isActive: item.isActive,
        draft: {
            canApply: item.draft.canApply,
            references: item.draft.impact.clearedReferences.map(publicReference),
            blockedReferences: item.draft.impact.blockedReferences.map(publicReference)
        },
        published: item.published ? {
            references: item.published.impact.clearedReferences.map(publicReference),
            blockedReferences: item.published.impact.blockedReferences.map(publicReference)
        } : null
    }))
});

const loadFormAndWorkflows = async ({ formId, userId, transaction, lock = null, models = null }) => {
    const resolvedModels = models ? { ...defaultModels, ...models } : defaultModels;
    const formModel = models?.Form || resolvedModels.Form;
    const workflowModel = models?.Workflow || (models ? null : resolvedModels.Workflow);
    const workflows = workflowModel
        ? await workflowModel.findAll({
            where: { userId },
            transaction,
            ...(lock ? { lock } : {})
        })
        : [];
    const form = await formModel.findOne({
        where: { id: formId, userId },
        transaction,
        ...(lock ? { lock } : {})
    });
    if (!form) throw formNotFound();
    return { form, workflows };
};

const buildPlan = async ({ form, workflows, nextSchema, transaction, models, nodeRegistry = NodeRegistry }) => {
    const snapshots = await workflowSnapshots({ workflows, transaction, models });
    return planFormFieldChange({
        currentSchema: form.toJSON(),
        nextSchema,
        workflows: snapshots,
        schemaForNode: node => nodeRegistry.getDefinition?.(node?.type, node?.subType)?.configSchema || node?.schema || {}
    });
};

const assertExpectedFormRevision = ({ form, expectedFormUpdatedAt }) => {
    if (!expectedFormUpdatedAt) return;
    if (new Date(form.updatedAt).getTime() === new Date(expectedFormUpdatedAt).getTime()) return;
    throw formChangeError('FORM_CHANGE_STALE', 'This form changed while you were reviewing the deletion. Generate a new review.', 409);
};

const assertExpectedWorkflowRevisions = ({ plan, workflowRevisions = {} }) => {
    if (!workflowRevisions || typeof workflowRevisions !== 'object') return;
    for (const item of plan.affectedWorkflows) {
        if (!Object.hasOwn(workflowRevisions, item.workflowId)) continue;
        if (Number(workflowRevisions[item.workflowId]) !== Number(item.revision)) {
            throw formChangeError('FORM_CHANGE_STALE', 'Affected workflow changed while you were reviewing the deletion. Generate a new review.', 409);
        }
    }
};

const assertPlanCanApply = plan => {
    if (plan.liveBlockers.length > 0) {
        throw formChangeError(
            'FORM_FIELD_DELETION_LIVE_DEPENDENCY',
            'A live workflow still uses a field being deleted. Repair and publish that workflow before deleting the field.',
            409,
            publicPlan(plan)
        );
    }
    if (plan.draftBlockers.length > 0) {
        throw formChangeError(
            'FORM_FIELD_DELETION_BLOCKED',
            'A workflow contains a malformed reference that must be repaired before deleting the field.',
            409,
            publicPlan(plan)
        );
    }
};

/** Read-only preview used by the form editor and proposal UIs. */
export const previewFormChange = async ({ formId, userId, nextSchema, models = null, nodeRegistry = NodeRegistry }) => {
    const { form, workflows } = await loadFormAndWorkflows({ formId, userId, models });
    const candidate = nextSchemaFor(form, nextSchema);
    validateNextSchema(candidate);
    const plan = await buildPlan({ form, workflows, nextSchema: candidate, models, nodeRegistry });
    return {
        ...publicPlan(plan),
        formUpdatedAt: form.updatedAt,
        workflowRevisions: Object.fromEntries(plan.affectedWorkflows.map(item => [item.workflowId, item.revision]))
    };
};

const applyInTransaction = async ({ formId, userId, nextSchema, expectedFormUpdatedAt, workflowRevisions, reviewConfirmed, transaction, models = null, nodeRegistry = NodeRegistry, saveDraft = saveAutomationDraft }) => {
    const { form, workflows } = await loadFormAndWorkflows({
        formId,
        userId,
        transaction,
        lock: transaction?.LOCK?.UPDATE || null,
        models
    });
    assertExpectedFormRevision({ form, expectedFormUpdatedAt });
    const candidate = nextSchemaFor(form, nextSchema);
    validateNextSchema(candidate);
    const plan = await buildPlan({ form, workflows, nextSchema: candidate, transaction, models, nodeRegistry });

    if (plan.requiresReview && reviewConfirmed !== true) {
        throw formChangeError(
            'FORM_FIELD_DELETION_REVIEW_REQUIRED',
            'Review the workflows affected by this field deletion before applying it.',
            409,
            publicPlan(plan)
        );
    }
    assertExpectedWorkflowRevisions({ plan, workflowRevisions });
    assertPlanCanApply(plan);

    await form.update({
        title: candidate.title,
        description: candidate.description,
        settings: candidate.settings,
        fields: plan.nextSchema.fields
    }, { transaction });

    const workflowChanges = [];
    for (const item of plan.affectedWorkflows) {
        if (item.draft.impact.clearedReferences.length === 0) continue;
        const saved = await saveDraft({
            automationId: item.workflowId,
            userId,
            nodes: item.draft.nodes,
            edges: item.draft.edges,
            expectedRevision: item.revision,
            source: 'form-field-deletion',
            summary: `Repaired references after removing ${plan.removedFieldIds.length} form field${plan.removedFieldIds.length === 1 ? '' : 's'}`,
            transaction
        });
        workflowChanges.push({
            workflowId: item.workflowId,
            revision: saved.automation.revision,
            clearedReferences: item.draft.impact.clearedReferences.map(publicReference)
        });
    }

    return {
        form,
        plan: publicPlan(plan),
        workflowChanges
    };
};

/** Apply a form schema change and dependent draft repairs atomically. */
export const applyFormChange = async ({
    formId,
    userId,
    nextSchema,
    expectedFormUpdatedAt,
    workflowRevisions,
    reviewConfirmed = false,
    transaction: externalTransaction = null,
    models = null,
    db = sequelize,
    nodeRegistry = NodeRegistry,
    saveDraft = saveAutomationDraft
} = {}) => {
    const run = transaction => applyInTransaction({
        formId,
        userId,
        nextSchema,
        expectedFormUpdatedAt,
        workflowRevisions,
        reviewConfirmed,
        transaction,
        models,
        nodeRegistry,
        saveDraft
    });
    return externalTransaction ? run(externalTransaction) : db.transaction(run);
};
