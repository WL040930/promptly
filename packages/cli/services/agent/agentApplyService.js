import sequelize from '../../db/index.js';
import { AgentRun, ChatMessage, ChatSession, Form, Workflow } from '../../models/index.js';
import { applyFormPatches } from '../ai/formPatchEngine.js';
import { validateFormSchema } from '../ai/formSchemaValidator.js';
import { validateWorkflow } from '../engine/workflowValidator.js';
import NodeRegistry from '../../utils/NodeRegistry.js';
import { reconcileWorkflow } from '../triggers/triggerRuntime.js';
import { createApproval, getRunArtifacts, getRunForUser, serializeRun } from './agentRunStore.js';
import { makeError } from './agentContracts.js';

const revisionMatches = (current, expected) => !expected || new Date(current).getTime() === new Date(expected).getTime();

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
    if (source && !revisionMatches(source.updatedAt, content.baseWorkflowUpdatedAt)) {
        throw Object.assign(new Error('The workflow changed after this proposal was created.'), { code: 'AGENT_STALE_RESOURCE' });
    }

    const nodes = (content.nodes || []).map(node => node.subType === 'form-submission' && form
        ? { ...node, config: { ...(node.config || {}), formId: node.config?.formId || form.id } }
        : node);
    const edges = content.edges || [];
    const validation = validateWorkflow({ nodes, edges, isActive: false, registry: NodeRegistry });
    if (!validation.valid) throw Object.assign(new Error('The workflow proposal failed validation.'), { code: 'AGENT_INVALID_PROPOSAL', issues: validation.issues });

    const workflow = source || await Workflow.create({
        name: content.name || 'New Workflow',
        status: 'Draft',
        isActive: false,
        iconColor: 'text-indigo-600',
        iconBg: 'bg-indigo-100',
        nodes,
        edges,
        userId
    }, { transaction });
    if (source) await workflow.update({ nodes, edges }, { transaction });
    return workflow;
};

const markProposalMessage = (run, proposalStatus, transaction = undefined) => {
    if (!run.metadata?.proposalMessageId) return Promise.resolve();
    return ChatMessage.update(
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
    const artifacts = getRunArtifacts(run);
    const pendingArtifacts = artifacts.filter(artifact => artifact.status !== 'applied');
    const formArtifact = pendingArtifacts.find(artifact => artifact.type === 'form_proposal');
    const workflowArtifact = pendingArtifacts.find(artifact => artifact.type === 'workflow_proposal');
    let form = null;
    let appliedWorkflow = null;

    try {
        await run.update({ status: 'applying', currentStep: 'apply' });
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
                throw error;
            }
        }

        if (form && !workflowArtifact && run.intent?.domains?.includes('workflow')) {
            const session = await ChatSession.findByPk(run.sessionId);
            if (session) {
                const { resumeAgentAfterForm } = await import('./agentOrchestrator.js');
                const resumed = await resumeAgentAfterForm({ run, session, userId, formId: form.id });
                await session.update({ agentState: { status: 'awaiting_agent_approval', runId } });
                return { ...serializeRun(await getRunForUser(runId, userId)), followUpReply: resumed.reply };
            }
        }

        const session = await ChatSession.findByPk(run.sessionId);
        if (session) await session.update({ agentState: {} });
        return serializeRun(await getRunForUser(runId, userId));
    } catch (error) {
        const failure = makeError(error);
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
    const session = await ChatSession.findByPk(run.sessionId);
    if (session) await session.update({ agentState: {} });
    return serializeRun(await getRunForUser(runId, userId));
};
