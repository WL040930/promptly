import sequelize from '../../db/index.js';
import { AgentRun, AssistantMessage, AssistantThread, Form, Workflow } from '../../models/index.js';
import { applyFormPatches } from '../ai/form/domain/formPatchEngine.js';
import { validateFormSchema } from '../ai/form/domain/formSchemaValidator.js';
import { validateWorkflow } from '../engine/workflowValidator.js';
import NodeRegistry from '../../utils/NodeRegistry.js';
import { reconcileWorkflow } from '../triggers/triggerRuntime.js';
import { createApproval, getRunArtifacts, getRunForUser, serializeRun, updateArtifact } from './agentRunStore.js';
import { makeError } from './agentContracts.js';
import { DEFAULT_AUTOMATION_NAME } from '../../../shared/automationDefaults.js';
import { clearChatSessionState, replaceChatSessionState } from '../chat/chatTurnLifecycle.js';
import googleSpreadsheetService from '../nodes/googleSpreadsheetService.js';
import { applyFormResponseSpreadsheetContract } from '../ai/workflow/formSpreadsheetContract.js';
import { provisionWorkflowResources } from '../ai/workflow/workflowResourceProvisioner.js';

const revisionMatches = (current, expected) => !expected || new Date(current).getTime() === new Date(expected).getTime();
const workflowRevisionMatches = (current, expected) => expected === undefined || expected === null || Number(current) === Number(expected);

export const prepareAgentWorkflowArtifact = async ({
    run,
    artifact,
    formArtifact = null,
    userId,
    spreadsheetService = googleSpreadsheetService
} = {}) => {
    if (!artifact) return null;
    const initialContent = artifact.content || {};
    const responseContract = applyFormResponseSpreadsheetContract({
        nodes: initialContent.nodes || [],
        resourceChanges: initialContent.resourceChanges || [],
        form: formArtifact?.content?.schema || null
    });
    let workingContent = {
        ...initialContent,
        nodes: responseContract.nodes,
        resourceChanges: responseContract.resourceChanges
    };
    const hasProvisioning = (workingContent.resourceChanges || []).some(change => change?.type === 'create_google_spreadsheet');
    if (!hasProvisioning) {
        return responseContract.applied
            ? updateArtifact(run, artifact.artifactKey, { content: workingContent })
            : artifact;
    }

    const persistProvisioningResource = async ({ change, resource }) => {
        workingContent = {
            ...workingContent,
            resourceChanges: (workingContent.resourceChanges || []).map(candidate => candidate?.ref === change.ref
                ? {
                    ...candidate,
                    status: 'provisioning',
                    spreadsheetId: resource.id,
                    range: resource.range,
                    webViewLink: resource.webViewLink || null
                }
                : candidate)
        };
        await updateArtifact(run, artifact.artifactKey, { content: workingContent });
    };

    const provisioned = await provisionWorkflowResources({
        nodes: workingContent.nodes,
        changes: workingContent.resourceChanges,
        userId,
        provisioningKeyPrefix: `agent-run:${run.id}:${artifact.id}`,
        spreadsheetService,
        onFileReady: persistProvisioningResource
    });
    workingContent = {
        ...workingContent,
        nodes: provisioned.nodes,
        resourceChanges: provisioned.changes
    };
    return updateArtifact(run, artifact.artifactKey, { content: workingContent });
};

const applyFormArtifact = async ({ artifact, userId, transaction }) => {
    const content = artifact.content || {};
    const source = content.formId
        ? await Form.findOne({ where: { id: content.formId, userId }, transaction, lock: transaction.LOCK.UPDATE })
        : null;
    if (content.formId && !source) throw Object.assign(new Error('The target form no longer exists.'), { code: 'AGENT_RESOURCE_NOT_FOUND' });
    if (source && !revisionMatches(source.updatedAt, content.baseFormUpdatedAt)) {
        throw Object.assign(new Error('The form changed after this proposal was created.'), { code: 'AGENT_STALE_RESOURCE' });
    }

    const schema = source && Array.isArray(content.patches)
        ? applyFormPatches({ currentSchema: source.toJSON(), patches: content.patches }).schema
        : content.schema;
    const issues = validateFormSchema(schema || {});
    if (issues.length > 0) throw Object.assign(new Error('The form proposal failed validation.'), { code: 'AGENT_INVALID_PROPOSAL', issues });

    const form = source || await Form.create({
        title: schema.title,
        description: schema.description || '',
        settings: schema.settings || {},
        fields: schema.fields || [],
        userId
    }, { transaction });
    if (source) await form.update({
        title: schema.title,
        description: schema.description || '',
        settings: schema.settings || {},
        fields: schema.fields || []
    }, { transaction });
    return form;
};

const applyWorkflowArtifact = async ({ artifact, userId, form, transaction }) => {
    const content = artifact.content || {};
    const source = content.workflowId
        ? await Workflow.findOne({ where: { id: content.workflowId, userId }, transaction, lock: transaction.LOCK.UPDATE })
        : null;
    if (content.workflowId && !source) throw Object.assign(new Error('The target workflow no longer exists.'), { code: 'AGENT_RESOURCE_NOT_FOUND' });
    if (source && !workflowRevisionMatches(source.revision, content.baseWorkflowRevision)) {
        throw Object.assign(new Error('The workflow changed after this proposal was created.'), { code: 'AGENT_STALE_RESOURCE' });
    }
    if (source && content.baseWorkflowRevision === undefined && !revisionMatches(source.updatedAt, content.baseWorkflowUpdatedAt)) {
        throw Object.assign(new Error('The workflow changed after this proposal was created.'), { code: 'AGENT_STALE_RESOURCE' });
    }

    const nodes = (content.nodes || []).map(node => ({ ...node, config: { ...(node.config || {}) } }));
    for (const binding of content.resourceBindings || []) {
        const targetNode = nodes.find(node => node.id === binding.target?.nodeId);
        if (!targetNode || binding.target?.path !== 'config.formId') {
            throw Object.assign(new Error('The workflow proposal contains an invalid resource binding.'), { code: 'AGENT_INVALID_PROPOSAL' });
        }
        if (binding.source?.artifactKey !== 'form_proposal' || binding.source?.appliedResource !== 'id' || !form) {
            throw Object.assign(new Error('The workflow proposal references an unresolved form.'), { code: 'AGENT_RESOURCE_NOT_FOUND' });
        }
        targetNode.config.formId = form.id;
    }
    nodes.forEach(node => {
        if (node.subType === 'form-submission' && form && !node.config.formId) node.config.formId = form.id;
    });
    const edges = content.edges || [];
    const validation = validateWorkflow({ nodes, edges, isActive: false, registry: NodeRegistry });
    if (!validation.valid) throw Object.assign(new Error('The workflow proposal failed validation.'), { code: 'AGENT_INVALID_PROPOSAL', issues: validation.issues });

    const workflow = source || await Workflow.create({
        name: content.name || DEFAULT_AUTOMATION_NAME,
        status: 'Draft',
        isActive: false,
        iconColor: 'text-indigo-600',
        iconBg: 'bg-indigo-100',
        nodes,
        edges,
        revision: 1,
        userId
    }, { transaction });
    const nextRevision = Number(workflow.revision || 0) + (source ? 1 : 0);
    if (source) {
        // Applying an AI proposal changes only the working draft.
        await workflow.update({ nodes, edges, revision: nextRevision }, { transaction });
    }
    return workflow;
};

const markProposalMessage = (run, proposalStatus, transaction = undefined) => {
    if (!run.metadata?.proposalMessageId) return Promise.resolve();
    return AssistantMessage.update(
        { proposalStatus },
        { where: { id: run.metadata.proposalMessageId }, ...(transaction ? { transaction } : {}) }
    );
};

export const approveAgentRun = async ({ runId, userId, idempotencyKey }) => {
    const run = await AgentRun.findOne({ where: { id: runId, userId } });
    if (!run) throw Object.assign(new Error('Agent run not found.'), { code: 'AGENT_RUN_NOT_FOUND' });
    if (run.status === 'completed') return serializeRun(await getRunForUser(runId, userId));
    if (run.status !== 'awaiting_approval') throw Object.assign(new Error('This agent run is not awaiting approval.'), { code: 'AGENT_RUN_NOT_APPROVABLE' });

    const key = String(idempotencyKey || '').trim();
    if (!key) throw Object.assign(new Error('An idempotency key is required.'), { code: 'AGENT_IDEMPOTENCY_REQUIRED' });
    if (run.approval?.status === 'approved') return serializeRun(run);
    const approval = run.approval || await createApproval({ run, userId, artifactIds: [], idempotencyKey: key });
    let artifacts = getRunArtifacts(run);
    let pendingArtifacts = artifacts.filter(artifact => artifact.status !== 'applied');
    let formArtifact = pendingArtifacts.find(artifact => artifact.type === 'form_proposal');
    let workflowArtifact = pendingArtifacts.find(artifact => artifact.type === 'workflow_proposal');
    let form = null;
    let appliedWorkflow = null;
    let triggerSetupError = null;

    try {
        await run.update({ status: 'applying', currentStep: 'apply' });
        if (workflowArtifact) {
            workflowArtifact = await prepareAgentWorkflowArtifact({ run, artifact: workflowArtifact, formArtifact, userId });
            artifacts = getRunArtifacts(run);
            pendingArtifacts = artifacts.filter(artifact => artifact.status !== 'applied');
            formArtifact = pendingArtifacts.find(artifact => artifact.type === 'form_proposal');
            workflowArtifact = pendingArtifacts.find(artifact => artifact.type === 'workflow_proposal');
        }
        await sequelize.transaction(async transaction => {
            if (formArtifact) form = await applyFormArtifact({ artifact: formArtifact, userId, transaction });
            if (workflowArtifact) appliedWorkflow = await applyWorkflowArtifact({ artifact: workflowArtifact, userId, form, transaction });

            const appliedIds = new Set(pendingArtifacts.map(artifact => artifact.id));
            const nextArtifacts = artifacts.map(artifact => appliedIds.has(artifact.id) ? { ...artifact, status: 'applied' } : artifact);
            const nextApproval = {
                ...approval,
                status: workflowArtifact ? 'approved' : 'partial',
                artifactIds: artifacts.map(artifact => artifact.id),
                approvedAt: workflowArtifact ? new Date() : null
            };
            await markProposalMessage(run, 'applied', transaction);
            await run.update({
                artifacts: nextArtifacts,
                approval: nextApproval,
                status: workflowArtifact ? 'completed' : 'awaiting_approval',
                currentStep: workflowArtifact ? null : 'design_workflow',
                error: null
            }, { transaction });
        });

        if (appliedWorkflow) {
            try {
                await reconcileWorkflow(appliedWorkflow);
            } catch (error) {
                await appliedWorkflow.update({ isActive: false, status: 'Trigger setup failed' });
                triggerSetupError = error;
            }
        }

        if (triggerSetupError) {
            const setupFailure = makeError(triggerSetupError);
            await run.update({
                status: 'completed',
                currentStep: 'setup',
                error: { code: 'AGENT_TRIGGER_SETUP_FAILED', message: setupFailure.message, issues: setupFailure.issues },
                metadata: { ...(run.metadata || {}), setupRequired: true }
            });
            const session = await AssistantThread.findByPk(run.threadId);
            if (session) await clearChatSessionState(session);
            return serializeRun(await getRunForUser(runId, userId));
        }

        if (form && !workflowArtifact && run.intent?.domains?.includes('workflow')) {
            const session = await AssistantThread.findByPk(run.threadId);
            if (session) {
                const { resumeAgentAfterForm } = await import('./agentOrchestrator.js');
                const resumed = await resumeAgentAfterForm({ run, session, userId, formId: form.id });
                await replaceChatSessionState(session, { status: 'awaiting_agent_approval', runId });
                return { ...serializeRun(await getRunForUser(runId, userId)), followUpReply: resumed.reply };
            }
        }

        const session = await AssistantThread.findByPk(run.threadId);
        if (session) await clearChatSessionState(session);
        return serializeRun(await getRunForUser(runId, userId));
    } catch (error) {
        const failure = makeError(error);
        if (/^(?:GOOGLE_|WORKFLOW_PROVISION_)/.test(failure.code)) {
            const retryableApproval = { ...(run.approval || approval), status: 'pending', metadata: { error: failure } };
            await run.update({ status: 'awaiting_approval', currentStep: null, error: failure, approval: retryableApproval });
            throw Object.assign(new Error(failure.message), failure);
        }
        const failedApproval = { ...(run.approval || approval), status: 'failed', metadata: { error: failure } };
        await run.update({ status: 'failed', currentStep: null, error: failure, approval: failedApproval });
        throw Object.assign(new Error(failure.message), failure);
    }
};

export const rejectAgentRun = async ({ runId, userId }) => {
    const run = await AgentRun.findOne({ where: { id: runId, userId } });
    if (!run) throw Object.assign(new Error('Agent run not found.'), { code: 'AGENT_RUN_NOT_FOUND' });
    if (run.status === 'completed') throw Object.assign(new Error('A completed agent run cannot be rejected.'), { code: 'AGENT_RUN_COMPLETE' });

    const approval = {
        ...(run.approval || { id: `approval_${runId}`, userId, artifactIds: [] }),
        status: 'rejected',
        rejectedAt: new Date()
    };
    const artifacts = getRunArtifacts(run).map(artifact => ({ ...artifact, status: 'rejected' }));
    await markProposalMessage(run, 'ignored');
    await run.update({ status: 'blocked', currentStep: null, artifacts, approval });
    const session = await AssistantThread.findByPk(run.threadId);
    if (session) await clearChatSessionState(session);
    return serializeRun(await getRunForUser(runId, userId));
};
