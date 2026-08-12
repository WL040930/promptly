import { applyResourceContextDelta, buildResourceIdentity } from '../../assistant/resourceContext.js';
import { compileWorkflowBindings, validateWorkflowExpressions } from '../../../../shared/workflowExpressions.js';
import { finishAssistantWork } from '../../../../shared/assistantWork.js';
import { applyFormResponseSpreadsheetContract } from './formSpreadsheetContract.js';

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
        return Form.findOne({ where: { id: formId, userId }, transaction });
    };

    const validateBindings = async ({ workflow, userId, transaction, nodes = [] }) => {
        const form = await attachedForm(workflow, userId, transaction, nodes);
        const normalizedBindings = compileWorkflowBindings({ nodes, formSchema: form?.toJSON?.() || null });
        const issues = [
            ...normalizedBindings.issues,
            ...validateWorkflowExpressions({ nodes: normalizedBindings.nodes, formSchema: form?.toJSON?.() || null })
        ];
        if (issues.length > 0) {
            throw errorWith(
                'WORKFLOW_PROPOSAL_VARIABLE_INVALID',
                [...new Set(issues.map(issue => issue.message))].join(' '),
                409,
                { issues }
            );
        }
        return { form, normalizedBindings };
    };

    const provisionGoogleSheets = async ({ changes = [], userId, workflowId, proposalMessageId, onFileReady }) => {
        const resources = new Map();
        const resolvedChanges = [];
        for (const change of changes) {
            if (change?.type !== 'create_google_spreadsheet') {
                resolvedChanges.push(change);
                continue;
            }
            const created = await spreadsheetService.createAndInitialize({
                userId,
                title: change.title,
                sheetTitle: change.sheetTitle || 'Responses',
                headers: change.headers || [],
                provisioningKey: `workflow-proposal:${workflowId}:${proposalMessageId}:${change.ref}`,
                folderId: change.folderId || null,
                // Only reuse an ID that Promptly persisted after Drive returned
                // it; never trust an AI-authored spreadsheet ID as a provider
                // resource identity.
                existingSpreadsheetId: change.status === 'provisioning' ? change.spreadsheetId || null : null,
                onFileReady: resource => onFileReady?.({ change, resource })
            });
            resources.set(change.ref, created);
            resolvedChanges.push({ ...change, status: 'ready', spreadsheetId: created.id, webViewLink: created.webViewLink, range: created.range });
        }
        return { resources, resolvedChanges };
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
                await validateBindings({ workflow: lockedWorkflow, userId, transaction, nodes: payload.nodes || [] });
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
                const provisioned = await provisionGoogleSheets({
                    changes: responseSheetContract.resourceChanges,
                    userId,
                    workflowId,
                    proposalMessageId,
                    onFileReady: async ({ change, resource }) => {
                        await updateFreshProposal(current => ({
                            payload: payloadWithProvisionedFile(current.payload || payload, change.ref, resource)
                        }));
                    }
                });
                provisionedResources = provisioned.resources;
                createdResources = [...provisionedResources.values()];
                resolvedPayload = {
                    ...payload,
                    nodes: resolveProvisionedGoogleSheetConfigs(responseSheetContract.nodes, provisionedResources, errorWith),
                    resourceChanges: provisioned.resolvedChanges
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
                const proposalNodes = resolveProvisionReferences(resolvedPayload.nodes || [], provisionedResources, errorWith);
                const { normalizedBindings } = await validateBindings({ workflow: lockedWorkflow, userId, transaction, nodes: proposalNodes });
                const saved = await saveDraft({
                    automationId: lockedWorkflow.id,
                    userId,
                    nodes: normalizedBindings.nodes,
                    edges: resolvedPayload.edges,
                    expectedRevision: resolvedPayload.baseWorkflowRevision,
                    source: 'ai',
                    summary: 'Applied workflow AI proposal',
                    transaction
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
