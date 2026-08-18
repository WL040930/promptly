import { applyResourceContextDelta, buildResourceIdentity } from '../../assistant/resourceContext.js';
import { compileWorkflowBindings, normalizeWorkflowReferences, validateWorkflowExpressions } from '../../../../shared/workflowExpressions.js';
import { finishAssistantWork } from '../../../../shared/assistantWork.js';
import { applyFormResponseSpreadsheetContract } from './formSpreadsheetContract.js';
import { provisionWorkflowResources } from './workflowResourceProvisioner.js';
import { validateFormResponseSheetDestination } from './domain/formResponseSheetDestination.js';
import NodeRegistry from '../../../utils/NodeRegistry.js';

const isProvisionReference = value => value !== null && typeof value === 'object' && !Array.isArray(value)
    && typeof value.$provision === 'string' && Object.keys(value).length === 1;

const resolveProvisionReferences = (value, resources, errorWith) => {
    if (isProvisionReference(value)) {
        const resource = resources.get(value.$provision);
        if (!resource?.id) throw errorWith('WORKFLOW_PROVISION_REFERENCE_INVALID', 'A proposed Google Sheet could not be resolved before saving the workflow.', 409);
        return resource.id;
    }
    if (Array.isArray(value)) return value.map(item => resolveProvisionReferences(item, resources, errorWith));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveProvisionReferences(item, resources, errorWith)]));
    return value;
};

/**
 * A spreadsheet created by a proposal has no real ID or tab metadata until
 * Apply. The provisioner is therefore the source of truth for both dependent
 * node values; never retain an AI-authored A1 range for that new spreadsheet.
 */
export const resolveProvisionedGoogleSheetConfigs = (nodes = [], resources, errorWith) => nodes.map(node => {
    if (node?.subType !== 'googleSheets' || !isProvisionReference(node.config?.spreadsheetId)) return node;
    const resource = resources.get(node.config.spreadsheetId.$provision);
    if (!resource?.id || !resource?.range) {
        throw errorWith('WORKFLOW_PROVISION_REFERENCE_INVALID', 'A proposed Google Sheet could not be resolved before saving the workflow.', 409);
    }
    return {
        ...node,
        config: {
            ...(node.config || {}),
            spreadsheetId: resource.id,
            range: resource.range
        }
    };
});

const formIdForWorkflowNodes = (nodes = []) => nodes.find(node => node?.subType === 'form-submission')?.config?.formId || null;

export const applyWorkflowMetadataUpdates = async ({ workflow, updates = null, transaction, errorWith }) => {
    if (updates === null || updates === undefined) return workflow;
    if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
        throw errorWith('WORKFLOW_PROPOSAL_METADATA_INVALID', 'The workflow details update is invalid.', 400);
    }
    if (Object.keys(updates).some(key => key !== 'name')) {
        throw errorWith('WORKFLOW_PROPOSAL_METADATA_INVALID', 'Only the workflow name can be changed by this proposal.', 400);
    }
    if (updates.name === undefined) return workflow;
    if (typeof updates.name !== 'string' || !updates.name.trim() || updates.name.trim().length > 255) {
        throw errorWith('WORKFLOW_PROPOSAL_METADATA_INVALID', 'Workflow name must be between 1 and 255 characters.', 400);
    }
    await workflow.update({ name: updates.name.trim() }, { transaction });
    return workflow;
};

const payloadWithProvisionedFile = (payload, ref, resource) => ({
    ...payload,
    resourceChanges: (payload.resourceChanges || []).map(change => change?.ref === ref
        ? {
            ...change,
            status: 'provisioning',
            spreadsheetId: resource.id,
            webViewLink: resource.webViewLink,
            range: resource.range
        }
        : change)
});

export const createWorkflowProposalApplier = ({
    db,
    models,
    findWorkflow,
    ensureState,
    publicMessage,
    toWorkflowJson,
    saveDraft,
    spreadsheetService,
    now = () => new Date(),
    errorWith
} = {}) => {
    const { AssistantMessage, Form } = models;

    const attachedForm = async (workflow, userId, transaction, nodes = workflow.nodes || []) => {
        const formId = formIdForWorkflowNodes(nodes);
        if (!formId) return null;
        const sharedLock = transaction?.LOCK?.SHARE;
        return Form.findOne({
            where: { id: formId, userId },
            transaction,
            ...(sharedLock ? { lock: sharedLock } : {})
        });
    };

    const validateBindings = async ({ workflow, userId, transaction, nodes = [], edges = workflow.edges || [] }) => {
        const form = await attachedForm(workflow, userId, transaction, nodes);
        const formSchema = form?.toJSON?.() || null;
        const compiledBindings = compileWorkflowBindings({ nodes, formSchema });
        const normalizedReferences = normalizeWorkflowReferences({
            nodes: compiledBindings.nodes,
            edges,
            formSchema,
            schemaForNode: node => NodeRegistry.getDefinition?.(node?.type, node?.subType)?.configSchema || node?.schema || {},
            rejectLegacy: false
        });
        const issues = [
            ...compiledBindings.issues,
            ...normalizedReferences.issues,
            ...validateWorkflowExpressions({ nodes: normalizedReferences.nodes, edges, formSchema })
        ];
        if (issues.length > 0) {
            throw errorWith(
                'WORKFLOW_PROPOSAL_VARIABLE_INVALID',
                [...new Set(issues.map(issue => issue.message))].join(' '),
                409,
                { issues }
            );
        }
        return {
            form,
            normalizedBindings: {
                nodes: normalizedReferences.nodes,
                repairs: [...compiledBindings.repairs, ...normalizedReferences.repairs]
            }
        };
    };

    const apply = async ({ workflowId, userId, proposalMessageId, expectedStateVersion, workflow, message, payload }) => {
        if (payload.workflowId !== workflow.id) throw errorWith('WORKFLOW_PROPOSAL_SCOPE_INVALID', 'This proposal belongs to a different workflow.', 409);
        if (payload.readiness?.canApply === false) {
            throw errorWith(
                'WORKFLOW_PROPOSAL_SETUP_REQUIRED',
                'Complete the required setup before applying this workflow proposal.',
                409,
                { issues: payload.readiness.issues || [], setupActions: payload.readiness.setupActions || [] }
            );
        }
        const destinationIssues = validateFormResponseSheetDestination({
            nodes: payload.nodes || [],
            resourceChanges: payload.resourceChanges || [],
            spreadsheetIntent: payload.resourceIntent,
            capabilities: payload.capabilities || []
        });
        if (destinationIssues.length > 0) {
            throw errorWith(
                'WORKFLOW_FORM_RESPONSE_SHEET_DESTINATION_INVALID',
                'This proposal mixes one-time and per-submission Google Sheet creation. Generate a new proposal before applying it.',
                409,
                { issues: destinationIssues }
            );
        }

        // The initial status lock happens through a separate Sequelize
        // instance. Reload before each later write so a stale outer instance
        // cannot decide that `pending` is unchanged while the database row is
        // actually `applying`.
        const updateFreshProposal = async makePatch => {
            const current = await AssistantMessage.findOne({
                where: {
                    id: proposalMessageId,
                    kind: 'workflow_proposal',
                    ...(message.threadId ? { threadId: message.threadId } : {})
                }
            });
            if (!current) throw errorWith('WORKFLOW_PROPOSAL_NOT_FOUND', 'This workflow proposal could not be found.', 404);
            const patch = makePatch(current);
            await current.update(patch);
            Object.assign(message, patch);
            return current;
        };

        let resolvedPayload = payload;
        let provisionedResources = new Map();
        let createdResources = [];
        const needsProvisioning = (payload.resourceChanges || []).some(change => change?.type === 'create_google_spreadsheet');

        if (needsProvisioning) {
            await db.transaction(async transaction => {
                const lockedWorkflow = await findWorkflow(workflowId, userId, { transaction, lock: transaction.LOCK.UPDATE });
                const state = await ensureState({ workflow: lockedWorkflow, transaction });
                const lockedMessage = await AssistantMessage.findOne({
                    where: { id: proposalMessageId, threadId: state.threadId, kind: 'workflow_proposal' },
                    transaction,
                    lock: transaction.LOCK.UPDATE
                });
                if (!lockedMessage || lockedMessage.proposalStatus !== 'pending') {
                    throw errorWith(
                        lockedMessage?.proposalStatus === 'applying' ? 'WORKFLOW_PROPOSAL_APPLYING' : 'WORKFLOW_PROPOSAL_NOT_PENDING',
                        lockedMessage?.proposalStatus === 'applying'
                            ? 'This workflow proposal is already being applied. Wait for the current Apply request to finish.'
                            : 'This workflow proposal is no longer pending.',
                        409
                    );
                }
                if (Number.isInteger(expectedStateVersion) && expectedStateVersion !== state.version) {
                    throw errorWith('WORKFLOW_AI_STATE_CONFLICT', 'The workflow assistant changed in another tab. Refresh the conversation and try again.', 409, { currentStateVersion: state.version });
                }
                if (Number(payload.baseWorkflowRevision) !== Number(lockedWorkflow.revision)) throw errorWith('WORKFLOW_PROPOSAL_STALE', 'This workflow changed after the proposal was prepared. Generate a new proposal.', 409);
                await validateBindings({ workflow: lockedWorkflow, userId, transaction, nodes: payload.nodes || [], edges: payload.edges || [] });
                await lockedMessage.update({
                    proposalStatus: 'applying',
                    payload: {
                        ...payload,
                        apply: { status: 'applying', startedAt: now().toISOString() }
                    }
                }, { transaction });
            });
            const markRetryable = async error => {
                await updateFreshProposal(current => {
                    const currentPayload = current.payload || payload;
                    return {
                        proposalStatus: 'pending',
                        payload: {
                            ...currentPayload,
                            apply: {
                                ...(currentPayload.apply || {}),
                                status: 'retryable',
                                failedAt: now().toISOString(),
                                ...(error?.code ? { code: error.code } : {})
                            }
                        }
                    };
                }).catch(() => {});
            };
            try {
                const form = await attachedForm(workflow, userId, null, payload.nodes || []);
                const responseSheetContract = applyFormResponseSpreadsheetContract({
                    nodes: payload.nodes || [],
                    resourceChanges: payload.resourceChanges || [],
                    form: form?.toJSON?.() || form
                });
                const provisioned = await provisionWorkflowResources({
                    nodes: responseSheetContract.nodes,
                    changes: responseSheetContract.resourceChanges,
                    spreadsheetIntent: payload.resourceIntent,
                    capabilities: payload.capabilities || [],
                    userId,
                    provisioningKeyPrefix: `workflow-proposal:${workflowId}:${proposalMessageId}`,
                    spreadsheetService,
                    onFileReady: async ({ change, resource }) => {
                        await updateFreshProposal(current => ({
                            payload: payloadWithProvisionedFile(current.payload || payload, change.ref, resource)
                        }));
                    }
                });
                provisionedResources = provisioned.resources;
                createdResources = provisioned.createdResources;
                resolvedPayload = {
                    ...payload,
                    nodes: provisioned.nodes,
                    resourceChanges: provisioned.changes
                };
                await updateFreshProposal(() => ({ payload: resolvedPayload }));
            } catch (error) {
                await markRetryable(error);
                throw error;
            }
        }

        try {
            return await db.transaction(async transaction => {
                const lockedWorkflow = await findWorkflow(workflowId, userId, { transaction, lock: transaction.LOCK.UPDATE });
                const state = await ensureState({ workflow: lockedWorkflow, transaction });
                const lockedMessage = await AssistantMessage.findOne({
                    where: { id: proposalMessageId, threadId: state.threadId, kind: 'workflow_proposal' },
                    transaction,
                    lock: transaction.LOCK.UPDATE
                });
                if (!lockedMessage || !['pending', 'applying'].includes(lockedMessage.proposalStatus)) throw errorWith('WORKFLOW_PROPOSAL_NOT_PENDING', 'This workflow proposal is no longer pending.', 409);
                if (Number.isInteger(expectedStateVersion) && expectedStateVersion !== state.version) {
                    throw errorWith('WORKFLOW_AI_STATE_CONFLICT', 'The workflow assistant changed in another tab. Refresh the conversation and try again.', 409, { currentStateVersion: state.version });
                }
                if (Number(resolvedPayload.baseWorkflowRevision) !== Number(lockedWorkflow.revision)) throw errorWith('WORKFLOW_PROPOSAL_STALE', 'This workflow changed after the proposal was prepared. Generate a new proposal.', 409);
                const proposalNodes = resolvedPayload.nodes === undefined
                    ? (lockedWorkflow.nodes || [])
                    : resolveProvisionReferences(resolvedPayload.nodes || [], provisionedResources, errorWith);
                const proposalEdges = resolvedPayload.edges === undefined ? (lockedWorkflow.edges || []) : resolvedPayload.edges || [];
                // Validate and normalize on every Apply, including metadata-only
                // proposals. This also repairs valid legacy references on an
                // otherwise untouched historical draft before it is saved.
                const { normalizedBindings } = await validateBindings({ workflow: lockedWorkflow, userId, transaction, nodes: proposalNodes, edges: proposalEdges });
                const graphChanged = JSON.stringify(normalizedBindings.nodes) !== JSON.stringify(lockedWorkflow.nodes || [])
                    || JSON.stringify(proposalEdges) !== JSON.stringify(lockedWorkflow.edges || []);
                let saved = { automation: lockedWorkflow };
                if (graphChanged) {
                    saved = await saveDraft({
                        automationId: lockedWorkflow.id,
                        userId,
                        nodes: normalizedBindings.nodes,
                        edges: proposalEdges,
                        expectedRevision: resolvedPayload.baseWorkflowRevision,
                        source: 'ai',
                        summary: 'Applied workflow AI proposal',
                        transaction
                    });
                }
                await applyWorkflowMetadataUpdates({
                    workflow: saved.automation,
                    updates: resolvedPayload.workflowUpdates,
                    transaction,
                    errorWith
                });
                const appliedPayload = {
                    ...resolvedPayload,
                    ...(normalizedBindings.repairs.length > 0 ? {
                        nodes: normalizedBindings.nodes,
                        warnings: [...(resolvedPayload.warnings || []), ...normalizedBindings.repairs]
                    } : {}),
                    work: finishAssistantWork(resolvedPayload.work, { status: 'applied', detail: 'Changes applied to the workflow.' }, now())
                };
                await lockedMessage.update({ proposalStatus: 'applied', payload: appliedPayload }, { transaction });
                await state.updateContext(applyResourceContextDelta({
                    context: state.context,
                    delta: resolvedPayload.contextDelta,
                    identity: buildResourceIdentity({ surface: 'workflow', resource: toWorkflowJson(saved.automation) })
                }), { transaction });
                await state.update({
                    version: state.version + 1,
                    phase: state.activeProposalMessageId === lockedMessage.id ? 'idle' : state.phase,
                    activeWork: null,
                    openClarification: null,
                    activeProposalMessageId: state.activeProposalMessageId === lockedMessage.id ? null : state.activeProposalMessageId
                }, { transaction });
                return { workflow: toWorkflowJson(saved.automation), message: publicMessage(lockedMessage), state: state.toJSON(), createdResources };
            });
        } catch (error) {
            if (error.code === 'WORKFLOW_PROPOSAL_STALE') await updateFreshProposal(() => ({ proposalStatus: 'stale' })).catch(() => {});
            else if (needsProvisioning) {
                await updateFreshProposal(current => {
                    const currentPayload = current.payload || resolvedPayload || payload;
                    return {
                        proposalStatus: 'pending',
                        payload: {
                            ...currentPayload,
                            apply: {
                                ...(currentPayload.apply || {}),
                                status: 'retryable',
                                failedAt: now().toISOString(),
                                ...(error?.code ? { code: error.code } : {})
                            }
                        }
                    };
                }).catch(() => {});
            }
            throw error;
        }
    };

    return { apply };
};
