import { AssistantMessage, AutomationRun, Form, Workflow, User } from '../../models/index.js';
import { runFormTurn } from '../ai/formAIService.js';
import { resolveFormTurnContext } from '../ai/form/domain/formTurnContext.js';
import {
    requiredCapabilitiesForRequest
} from '../ai/workflow/workflowAgentService.js';
import { generateWorkflowTurn } from '../ai/workflow/pipeline/pipeline.js';
import { resolveResource } from '../chat/resourceResolver.js';
import { addUsage, requestAgentJson } from './agentAi.js';
import { decideAgentIntent } from './agentIntentRouter.js';
import { createAgentCapabilityRegistry } from './agentCapabilityRegistry.js';
import { createAgentRuntime } from './agentRuntime.js';
import env from '../../config/env.js';
import { makeError } from './agentContracts.js';
import {
    compileExecutionPlan,
    makeAdaptivePlan,
    makeFallbackOutcomePlan,
    isMaterialPlanChange,
    planFingerprint
} from './agentPlanCompiler.js';
import { DEFAULT_CLARIFICATION_MODE, getClarificationModeInstruction, normalizeClarificationMode } from '../../../shared/agentContract.js';
import { supersedePendingChatFormProposals } from '../proposalLifecycle.js';
import { DEFAULT_AUTOMATION_NAME } from '../../../shared/automationDefaults.js';
import { replaceChatSessionState } from '../chat/chatTurnLifecycle.js';
import {
    completeStep,
    createArtifact,
    createRun,
    createStep,
    failStep,
    getRunArtifacts,
    startStep,
    updateRun
} from './agentRunStore.js';

const planReviewPattern = /(?:\b(show|give|provide|present|review|explain|outline|draft)\b.{0,50}\b(plan|steps|approach)\b|\b(plan|steps|approach)\b.{0,50}\b(before|first|review|approve|proceed)\b|\bplan first\b)/i;
const DEFAULT_NEW_FORM_TITLE = 'Untitled Form';

export const shouldPauseForPlanReview = message => planReviewPattern.test(String(message || ''));

export const ensureRespondentEmailField = (schema = {}) => {
    const fields = Array.isArray(schema.fields) ? schema.fields : [];
    const existingEmailIndex = fields.findIndex(field => field?.type === 'email');
    if (existingEmailIndex >= 0) {
        const nextFields = fields.map((field, index) => index === existingEmailIndex ? { ...field, required: true } : field);
        return { ...schema, fields: nextFields };
    }

    const usedIds = new Set(fields.map(field => String(field?.id || '').trim()).filter(Boolean));
    let id = 'email';
    let suffix = 2;
    while (usedIds.has(id)) id = `email_${suffix++}`;
    return {
        ...schema,
        fields: [
            ...fields,
            { id, type: 'email', label: 'Email address', required: true }
        ]
    };
};

const titleFromFormCreateIntent = (intent = null) => {
    const operation = (intent?.requestedOperations || []).find(candidate =>
        candidate?.domain === 'form' && candidate?.action === 'create' && typeof candidate?.target === 'string'
    );
    const target = String(operation?.target || '')
        .trim()
        .replace(/^(?:a|an|the|new)\s+/i, '');
    if (!target || /^form$/i.test(target)) return null;

    return target.replace(/\b[a-z]/g, letter => letter.toUpperCase());
};

export const applyIntentFormTitleFallback = ({ schema = {}, patches = [], intent = null, isNewForm = false } = {}) => {
    if (!isNewForm || String(schema.title || '').trim() !== DEFAULT_NEW_FORM_TITLE) return { schema, patches };
    const title = titleFromFormCreateIntent(intent);
    if (!title) return { schema, patches };

    let hasMetadataPatch = false;
    const nextPatches = patches.map(patch => {
        if (patch?.op !== 'update_meta') return patch;
        hasMetadataPatch = true;
        return { ...patch, updates: { ...(patch.updates || {}), title } };
    });
    if (!hasMetadataPatch) {
        nextPatches.unshift({ op: 'update_meta', patchId: 'metadata', updates: { title } });
    }
    return { schema: { ...schema, title }, patches: nextPatches };
};

const messagePayload = message => {
    const value = message.toJSON ? message.toJSON() : message;
    return {
        id: value.id,
        sender: value.sender,
        text: value.text,
        createdAt: value.createdAt,
        kind: value.kind || 'text',
        payload: value.payload || null,
        proposalStatus: value.proposalStatus || null,
        tokenUsage: value.tokenUsage || null
    };
};

const saveReply = async (session, { text, kind = 'text', payload = null, tokenUsage = null, proposalStatus = null }) => {
    const message = await AssistantMessage.create({
        threadId: session.id,
        sender: 'bot',
        text: text || '',
        kind,
        payload,
        tokenUsage,
        proposalStatus
    });
    return messagePayload(message);
};

const compactForm = form => form ? ({
    id: form.id,
    name: form.title,
    type: 'form',
    updatedAt: form.updatedAt,
    fieldCount: Array.isArray(form.fields) ? form.fields.length : 0
}) : null;

const compactWorkflow = workflow => workflow ? ({
    id: workflow.id,
    name: workflow.name,
    type: 'workflow',
    updatedAt: workflow.updatedAt,
    nodeCount: Array.isArray(workflow.nodes) ? workflow.nodes.length : 0
}) : null;

export const research = async ({
    userId,
    intent,
    context,
    resolve = resolveResource,
    models = { Form, Workflow, AutomationRun }
}) => {
    const resources = [];
    const seen = new Set();
    const contextReferences = [
        context.formId ? { type: 'form', query: context.formId } : null,
        context.workflowId ? { type: 'workflow', query: context.workflowId } : null,
        context.executionId ? { type: 'execution', query: context.executionId } : null
    ].filter(Boolean);
    const contextTypes = new Set(contextReferences.map(reference => reference.type));
    const requestedReferences = [
        ...(intent.resourceReferences || []),
        ...(intent.resourceInputs || []).filter(reference => reference.query && reference.query !== 'mentioned form')
    ].filter(Boolean);

    const addResolvedResource = async (reference, result) => {
        const resourceModel = reference.type === 'form' ? models.Form : reference.type === 'workflow' ? models.Workflow : models.AutomationRun;
        const resource = await resourceModel.findOne({ where: { id: result.resource.id, userId } });
        if (!resource) return;
        resources.push({
            type: reference.type,
            id: resource.id,
            resource: reference.type === 'form'
                ? compactForm(resource)
                : reference.type === 'workflow'
                    ? compactWorkflow(resource)
                    : { id: resource.id, type: 'execution', updatedAt: resource.updatedAt, status: resource.status, workflowId: resource.workflowId },
            full: resource
        });
    };

    for (const reference of requestedReferences) {
        const key = `${reference.type}:${reference.query}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const result = await resolve({ userId, type: reference.type, reference: reference.query });
        if (result.status === 'ambiguous' && contextTypes.has(reference.type)) continue;
        if (result.status === 'ambiguous') return { status: 'ambiguous', type: reference.type, candidates: result.candidates };
        if (result.status === 'not_found' && intent.goal === 'modify') {
            return { status: 'not_found', type: reference.type, query: reference.query };
        }
        if (result.status === 'resolved') await addResolvedResource(reference, result);
    }

    for (const reference of contextReferences) {
        if (resources.some(resource => resource.type === reference.type)) continue;
        const key = `${reference.type}:${reference.query}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const result = await resolve({ userId, type: reference.type, reference: reference.query });
        if (result.status === 'resolved') await addResolvedResource(reference, result);
    }
    return { status: 'resolved', resources };
};

const resourceByType = (resources, type) => resources.find(item => item.type === type)?.full || null;

const planSolution = async ({ intent, clarificationMode = DEFAULT_CLARIFICATION_MODE, onActivity = null }) => {
    const needsModelPlan = intent.goal === 'modify'
        || intent.risk === 'high'
        || intent.domains.length > 1
        || intent.requirements.length > 2;
    if (!needsModelPlan) return { plan: makeFallbackOutcomePlan(intent), tokenUsage: {} };
    try {
        const result = await requestAgentJson({
            label: 'plan',
            prompt: [
                'Typed intent:', JSON.stringify(intent),
                '',
                'Resolved resources:', JSON.stringify(resources.map(item => item.resource)),
                '',
                'Clarification:', `${clarificationMode} - ${getClarificationModeInstruction(clarificationMode)}`,
                '',
                'Create a short outcome plan only. The runtime will construct supported executable steps from the typed intent. Do not add a verify or approval step; verification and approval are runtime policies.'
            ].join('\n'),
            onActivity
        });
        return { plan: makeAdaptivePlan(result.value, intent), tokenUsage: result.tokenUsage };
    } catch {
        return { plan: makeFallbackOutcomePlan(intent), tokenUsage: {} };
    }
};

const formHistory = async sessionId => {
    const messages = await AssistantMessage.findAll({
        where: { threadId: sessionId },
        order: [['createdAt', 'DESC']],
        limit: 12,
        attributes: ['sender', 'text']
    });
    return messages.reverse().map(message => ({ sender: message.sender, text: message.text }));
};

const designForm = async ({ run, session, message, form, intent = null, clarificationMode = DEFAULT_CLARIFICATION_MODE, turnContext = null, onEvent = null }) => {
    const step = await createStep(run, { stepKey: 'design_form', type: 'design_form' });
    await startStep(step);
    try {
        const requiredCapabilities = requiredCapabilitiesForRequest(message);
        const compoundFormWorkflow = intent?.domains?.includes('form') && intent?.domains?.includes('workflow');
        const request = compoundFormWorkflow || requiredCapabilities.includes('respondent_confirmation')
            ? [
                'Form design scope: create or update only the form requested by the user.',
                'The workflow agent will handle every post-submission action, integration, and delivery separately.',
                'Do not turn Sheet storage, approvals, notifications, or email delivery into form fields or settings.',
                ...(requiredCapabilities.includes('respondent_confirmation')
                    ? ['Collect at least one required email field for the workflow to use.']
                    : []),
                '',
                `Original request: ${message}`
            ].join('\n')
            : message;
        const result = await runFormTurn({
            request,
            currentSchema: form?.toJSON?.() || form || {},
            history: await formHistory(session.id),
            clarificationMode,
            turnContext,
            onProgress: progress => onEvent?.({ type: 'form.design.progress', runId: run.id, progress })
        });
        if (result.kind === 'reply' && form && /\b(already|current|existing|no changes? needed|nothing to change|no further changes?)\b/i.test(String(result.message || ''))) {
            const reused = { disposition: 'reused', formId: form.id, message: result.message || 'The existing form already satisfies the request.' };
            await completeStep(step, { result: reused, tokenUsage: result.tokenUsage || {} });
            return { status: 'completed', disposition: 'reused', form, tokenUsage: result.tokenUsage || {} };
        }
        if (result.kind === 'reply' || result.kind === 'clarification') {
            await completeStep(step, { result, tokenUsage: result.tokenUsage || {} });
            return { status: 'clarification', result, tokenUsage: result.tokenUsage || {} };
        }
        const baseSchema = requiredCapabilitiesForRequest(message).includes('respondent_confirmation')
            ? ensureRespondentEmailField(result.schema || {})
            : result.schema;
        const proposal = applyIntentFormTitleFallback({
            schema: baseSchema,
            patches: result.patches || [],
            intent,
            isNewForm: !form
        });
        const content = {
            action: form ? 'edit_form' : 'create_form',
            formId: form?.id || null,
            schema: proposal.schema,
            patches: proposal.patches,
            requirements: result.requirements || [],
            verification: result.verification || null,
            warnings: result.warnings || [],
            cardinality: result.cardinality || null,
            ...(form ? { baseFormUpdatedAt: form.updatedAt } : {})
        };
        const artifact = await createArtifact({
            run,
            type: 'form_proposal',
            artifactKey: 'form_proposal',
            content,
            baseResources: form ? [{ type: 'form', id: form.id, updatedAt: form.updatedAt }] : []
        });
        await completeStep(step, { result: { artifactId: artifact.id }, outputArtifactIds: [artifact.id], tokenUsage: result.tokenUsage || {} });
        return { status: 'completed', artifact, tokenUsage: result.tokenUsage || {} };
    } catch (error) {
        await failStep(step, error);
        throw error;
    }
};

export const proposedFormSchemaForWorkflow = ({ form = null, formSchema = null, formArtifactId = null } = {}) => {
    const schema = form?.toJSON?.() || form || formSchema || null;
    if (!schema || schema.id || !formArtifactId) return schema;
    return { ...schema, id: `artifact:${formArtifactId}` };
};

export const buildWorkflowProposalContent = ({ result, workflow = null, form = null, formArtifactId = null, formBinding = null } = {}) => {
    const action = (workflow?.nodes || []).length > 0 ? 'edit_workflow' : 'create_workflow';
    const formTrigger = (result?.nodes || []).find(node => node.subType === 'form-submission');
    const resourceBindings = [];
    if (!form && formBinding && formTrigger) {
        resourceBindings.push({
            target: { nodeId: formTrigger.id, path: 'config.formId' },
            source: formBinding.source || formBinding
        });
    }
    return {
        action,
        workflowId: workflow?.id || null,
        name: action === 'create_workflow' ? DEFAULT_AUTOMATION_NAME : workflow?.name,
        message: result?.message,
        nodes: result?.nodes || [],
        edges: result?.edges || [],
        diff: result?.diff,
        repairs: result?.warnings || [],
        baseWorkflowRevision: workflow?.revision || null,
        formArtifactId,
        ...(resourceBindings.length > 0 ? { resourceBindings } : {}),
        readiness: result?.readiness,
        plan: result?.plan,
        resourceChanges: result?.resourceChanges || [],
        resourceIntent: result?.resourceIntent || null,
        contextDelta: result?.contextDelta || null
    };
};

export const workflowTurnContextForAgent = ({ message, context = {}, intent = null, form = null } = {}) => {
    const state = context?.clarificationState;
    const delegated = context?.clarificationDecision === 'decide_for_me';
    const hasState = state && typeof state === 'object' && !Array.isArray(state) && Object.keys(state).length > 0;
    const formWasReferenced = Array.isArray(intent?.resourceReferences)
        && intent.resourceReferences.some(reference => reference?.type === 'form');
    const activeFormSource = form?.id && formWasReferenced
        ? { id: form.id, title: form.title || 'Selected form' }
        : null;
    if (!delegated && !hasState && !activeFormSource) return null;
    return {
        ...((delegated || hasState) ? {
            command: {
                type: delegated ? 'decide_for_me' : 'submit_clarification',
                ...(delegated
                    ? {
                        clarificationId: context.clarificationId || null,
                        ...(hasState ? { state } : {})
                    }
                    : {
                        text: String(context.clarificationText || '').trim(),
                        state
                    })
            }
        } : {}),
        intent: {
            sourceText: String(message || '').trim(),
            latestText: delegated ? '' : String(context.clarificationText || '').trim(),
            relationToPending: 'none',
            authority: delegated ? 'assistant' : 'user',
            clarificationMode: normalizeClarificationMode(context.clarificationMode),
            ...(activeFormSource ? { activeFormSource } : {})
        }
    };
};

export const formTurnContextForAgent = ({ message, context = {} } = {}) => {
    const state = context?.clarificationState;
    const hasState = state && typeof state === 'object' && !Array.isArray(state) && Object.keys(state).length > 0;
    const clarificationText = String(context.clarificationText || '').trim();
    const delegated = context?.clarificationDecision === 'decide_for_me';
    if (!delegated && !hasState && !clarificationText) return null;

    const resolved = resolveFormTurnContext({
        command: delegated
            ? { type: 'decide_for_me', clarificationId: context.clarificationId || null }
            : { type: 'submit_text', text: clarificationText },
        activeWork: { sourceText: String(message || '').trim() },
        clarificationMode: context.clarificationMode
    });

    return {
        ...resolved.intent,
        // The coordinator has already selected the form capability, so a
        // completed clarification remains an actionable form request even
        // when its latest answer is only a list of choices.
        expectsMutation: true,
        ...(hasState ? { clarificationState: state } : {}),
        ...(delegated ? { clarificationDecision: 'decide_for_me' } : {})
    };
};

const designWorkflow = async ({ run, userId, message, workflow, form, formSchema = null, formArtifactId = null, formBinding = null, respondentEmailFieldId = null, turnContext = null, onEvent = null }) => {
    const step = await createStep(run, { stepKey: 'design_workflow', type: 'design_workflow' });
    await startStep(step);
    try {
        const result = await generateWorkflowTurn({
            request: message,
            currentWorkflow: workflow?.toJSON?.() || workflow || { nodes: [], edges: [] },
            userId,
            formSchema: proposedFormSchemaForWorkflow({ form, formSchema, formArtifactId }),
            turnContext,
            onProgress: (progress) => {
                onEvent?.({
                    type: 'workflow.design.progress',
                    runId: run.id,
                    stage: progress.status,
                    message: progress.message,
                    progress
                });
            }
        });

        if (result.type === 'reply' || result.type === 'message') {
            const reply = {
                status: 'clarification',
                message: result.message,
                inputs: result.inputs || []
            };
            await completeStep(step, { result: reply, tokenUsage: result.tokenUsage || {} });
            return { status: 'clarification', result: reply, tokenUsage: result.tokenUsage || {} };
        }

        const content = buildWorkflowProposalContent({ result, workflow, form, formArtifactId, formBinding });

        const artifact = await createArtifact({
            run,
            type: 'workflow_proposal',
            artifactKey: 'workflow_proposal',
            content,
            baseResources: workflow ? [{ type: 'workflow', id: workflow.id, updatedAt: workflow.updatedAt }] : []
        });

        await completeStep(step, { result: { artifactId: artifact.id }, outputArtifactIds: [artifact.id], tokenUsage: result.tokenUsage });
        return { artifact, tokenUsage: result.tokenUsage };
    } catch (error) {
        const ambiguousRecipient = (error.issues || []).find(issue => issue.code === 'RESPONDENT_RECIPIENT_FIELD_AMBIGUOUS');
        if (ambiguousRecipient) {
            const inputs = (ambiguousRecipient.candidates || []).length > 0
                ? [{
                    id: 'respondent_email_field',
                    type: 'multiple_choice',
                    label: 'Which email field should receive the confirmation email?',
                    options: ambiguousRecipient.candidates.map(candidate => candidate.label)
                }]
                : [];
            const result = {
                status: 'clarification',
                message: 'I found more than one required email field. Which one should receive the confirmation email?',
                inputs
            };
            await completeStep(step, { result, tokenUsage: error.tokenUsage || {} });
            await updateRun(run, {
                status: 'awaiting_clarification',
                currentStep: 'design_workflow',
                metadata: {
                    ...(run.metadata || {}),
                    workflowClarification: {
                        kind: 'respondent_email_field',
                        candidates: ambiguousRecipient.candidates || []
                    }
                }
            });
            return { status: 'clarification', result, tokenUsage: error.tokenUsage || {} };
        }
        await failStep(step, error);
        throw error;
    }
};

const createSolutionCapabilityRegistry = ({
    run,
    session,
    message,
    form,
    workflow,
    resources,
    intent,
    clarificationMode,
    formTurnContext,
    userId,
    actorEmail,
    onEvent
}) => createAgentCapabilityRegistry([
    {
        name: 'research',
        description: 'Use the already-resolved account resources for this run.',
        risk: 'read',
        produces: ['resolved_resources'],
        execute: async () => ({ output: { resources: resources.map(item => item.resource) } })
    },
    {
        name: 'design_form',
        description: 'Prepare a reviewable form proposal.',
        risk: 'proposal',
        produces: ['form_proposal', 'form_resource'],
        execute: async () => {
            const result = await designForm({ run, session, message, form, intent, clarificationMode, turnContext: formTurnContext, onEvent });
            if (result.status === 'clarification') {
                return {
                    status: 'awaiting_clarification',
                    message: result.result.message,
                    output: { result },
                    tokenUsage: result.tokenUsage
                };
            }
            return {
                output: { artifact: result.artifact || null, disposition: result.disposition || 'created', formId: result.form?.id || null },
                tokenUsage: result.tokenUsage
            };
        }
    },
    {
        name: 'design_workflow',
        description: 'Prepare a reviewable workflow proposal.',
        risk: 'proposal',
        produces: ['workflow_proposal'],
        execute: async ({ context }) => {
            const formOutput = Object.values(context.dependencies || {}).find(output => output?.artifact || output?.disposition === 'reused')
                || context.state.outputs.design_form
                || {};
            const formProposal = formOutput.artifact || null;
            const result = await designWorkflow({
                run,
                userId,
                message,
                workflow,
                form,
                formSchema: formProposal?.content?.schema || null,
                formArtifactId: formProposal?.id || null,
                formBinding: !form && formProposal ? {
                    target: { path: 'nodes.form_submission.config.formId' },
                    source: { artifactKey: 'form_proposal', appliedResource: 'id' }
                } : null,
                respondentEmailFieldId: context.input?.context?.respondentEmailFieldId || null,
                turnContext: workflowTurnContextForAgent({ message, context: context.input?.context || {}, intent, form }),
                onEvent
            });
            if (result.status === 'clarification') {
                return {
                    status: 'awaiting_clarification',
                    message: result.result.message,
                    output: { result: result.result },
                    tokenUsage: result.tokenUsage
                };
            }
            return {
                output: { artifact: result.artifact },
                tokenUsage: result.tokenUsage
            };
        }
    }
]);

const verifySolutionArtifacts = (run, intent = null) => {
    const artifacts = getRunArtifacts(run);
    const issues = artifacts.flatMap(artifact => {
        if (artifact.type === 'form_proposal' && !artifact.content?.schema) {
            return [{ code: 'FORM_SCHEMA_MISSING', message: 'The form proposal has no schema.' }];
        }
        if (artifact.type === 'workflow_proposal' && (!Array.isArray(artifact.content?.nodes) || !Array.isArray(artifact.content?.edges))) {
            return [{ code: 'WORKFLOW_DEFINITION_MISSING', message: 'The workflow proposal is incomplete.' }];
        }
        return [];
    });
    const artifactTypes = new Set(artifacts.map(artifact => artifact.type));
    const expectedArtifacts = [
        ...(intent?.domains?.includes('form') && !(run.steps || []).some(step => step.stepKey === 'design_form' && step.result?.disposition === 'reused') ? ['form_proposal'] : []),
        ...(intent?.domains?.includes('workflow') ? ['workflow_proposal'] : [])
    ];
    for (const artifactType of expectedArtifacts) {
        if (!artifactTypes.has(artifactType)) {
            issues.push({
                code: 'EXPECTED_ARTIFACT_MISSING',
                path: 'artifacts',
                message: `The requested ${artifactType === 'form_proposal' ? 'form' : 'workflow'} outcome was not produced.`
            });
        }
    }
    if (issues.length > 0) return { status: 'blocked', issues };
    const readinessIssues = artifacts.flatMap(artifact => artifact.type === 'workflow_proposal'
        ? (artifact.content?.readiness?.issues || [])
        : []);
    return {
        status: readinessIssues.length > 0 ? 'needs_setup' : 'pass',
        issues: readinessIssues,
        artifactIds: artifacts.map(artifact => artifact.id)
    };
};

const repairExecutionPlan = async ({ plan, intent, issues, preserveOutcomes = true, onActivity = null }) => {
    const result = await requestAgentJson({
        label: 'plan',
        prompt: [
            'The proposed outcome plan is valid, but its executable capability graph is not.',
            preserveOutcomes ? 'Preserve the user-facing outcomes and repair only the execution steps.' : 'Keep the approved scope unless the runtime observation requires a material outcome change.',
            'Remove unavailable capabilities, fix dependencies, and use only capabilities listed by the runtime.',
            'Do not add verify or approval steps; those are runtime policies.',
            '',
            'Typed intent:', JSON.stringify(intent),
            'Current plan:', JSON.stringify(plan),
            'Validation issues:', JSON.stringify(issues),
            '',
            'Return the complete plan JSON.'
        ].join('\n'),
        onActivity
    });
    return {
        plan: makeAdaptivePlan({ ...result.value, ...(preserveOutcomes ? { outcomes: plan.outcomes } : {}) }, intent),
        tokenUsage: result.tokenUsage || {}
    };
};

const compilePlanWithRepair = ({ plan, intent, registry }) => {
    const canonicalPlan = makeAdaptivePlan(plan, intent);
    const compiled = compileExecutionPlan({ plan: canonicalPlan, registry });
    if (compiled.valid) return { plan: canonicalPlan, graph: compiled.graph, tokenUsage: {} };

    const error = new Error('Promptly could not prepare a safe executable proposal. Please try the request again.');
    error.code = 'AGENT_PLAN_INVALID';
    error.issues = compiled.issues;
    throw error;
};

const saveClarification = async ({ session, run, type, candidates, text }) => {
    await updateRun(run, { status: 'awaiting_clarification', currentStep: 'research' });
    await replaceChatSessionState(session, { status: 'awaiting_agent_clarification', runId: run.id });
    return saveReply(session, {
        text,
        kind: 'clarification',
        payload: {
            runId: run.id,
            options: [{
                id: `${type}-target`,
                type: `${type}_choice`,
                label: `Choose a ${type}`,
                options: candidates.map(candidate => type === 'form'
                    ? { id: candidate.id, title: candidate.name }
                    : { id: candidate.id, name: candidate.name })
            }]
        }
    });
};

const persistedContextFor = context => ({
    surface: context.surface || 'chat',
    formId: context.formId || null,
    workflowId: context.workflowId || null,
    executionId: context.executionId || null,
    activeResource: context.activeResource || null,
    respondentEmailFieldId: context.respondentEmailFieldId || null,
    clarificationAnswers: Array.isArray(context.clarificationAnswers) ? context.clarificationAnswers.slice(-8) : [],
    clarificationState: context.clarificationState && typeof context.clarificationState === 'object' && !Array.isArray(context.clarificationState)
        ? context.clarificationState
        : {},
    clarificationText: String(context.clarificationText || '').trim(),
    clarificationDecision: context.clarificationDecision === 'decide_for_me' ? 'decide_for_me' : null,
    clarificationId: context.clarificationId || null,
    clarificationMode: normalizeClarificationMode(context.clarificationMode)
});

export const processAgenticTurn = async ({ session, userId, message, context = {}, decision = null, run: existingRun = null, force = false, skipPlanReview = false, approvedPlan = null, onEvent = null }) => {
    const preAnalyzed = decision || (!force
        ? await decideAgentIntent({ message, context, onActivity: event => onEvent?.(event) })
        : null);
    if (!force && preAnalyzed?.route === 'conversation') return { handled: false };
    if (!force && preAnalyzed?.route === 'unavailable') {
        const reply = await saveReply(session, {
            text: preAnalyzed.error?.message || 'Promptly could not understand the request right now. Please try again.',
            kind: 'error',
            payload: { code: preAnalyzed.error?.code || 'AGENT_INTENT_UNAVAILABLE' },
            tokenUsage: preAnalyzed.tokenUsage || {}
        });
        return { handled: true, replyObj: reply, totalTokenUsage: preAnalyzed.tokenUsage || {} };
    }

    const persistedContext = persistedContextFor(context);
    if (!force && preAnalyzed?.route === 'clarification') {
        const run = await createRun({ threadId: session.id, userId, metadata: { request: message, context: persistedContext } });
        await updateRun(run, {
            status: 'awaiting_clarification',
            currentStep: 'understand',
            intent: preAnalyzed.intent,
            tokenUsage: preAnalyzed.tokenUsage || {}
        });
        await replaceChatSessionState(session, { status: 'awaiting_agent_clarification', runId: run.id });
        const reply = await saveReply(session, {
            text: preAnalyzed.clarification?.question || 'Could you clarify what you would like Promptly to prepare?',
            kind: 'clarification',
            payload: {
                runId: run.id,
                intent: preAnalyzed.intent,
                options: preAnalyzed.clarification?.options || [],
                allowDecide: true
            },
            tokenUsage: preAnalyzed.tokenUsage || {}
        });
        return { handled: true, replyObj: reply, totalTokenUsage: preAnalyzed.tokenUsage || {} };
    }

    if (!force && preAnalyzed?.route !== 'agent') return { handled: false };

    const run = existingRun || await createRun({ threadId: session.id, userId, metadata: { request: message, context: persistedContext } });
    if (existingRun) {
        await updateRun(run, {
            metadata: {
                ...(run.metadata || {}),
                request: message,
                context: persistedContext
            }
        });
    }
    let totalUsage = {};
    try {
        onEvent?.({ type: 'run.started', runId: run.id });
        await updateRun(run, { status: 'understanding', currentStep: 'understand' });
        onEvent?.({ type: 'step.started', runId: run.id, step: 'understand' });
        const intentStep = await createStep(run, { stepKey: 'understand', type: 'understand' });
        await startStep(intentStep);
        const analyzed = preAnalyzed || await decideAgentIntent({ message, context, onActivity: event => onEvent?.(event) });
        if (!analyzed?.intent) throw Object.assign(new Error('Promptly could not prepare a typed intent.'), { code: 'AGENT_INTENT_INVALID' });
        totalUsage = addUsage(totalUsage, analyzed.tokenUsage);
        await updateRun(run, { intent: analyzed.intent, tokenUsage: totalUsage });
        await completeStep(intentStep, { result: analyzed.intent, tokenUsage: analyzed.tokenUsage });

        onEvent?.({ type: 'step.completed', runId: run.id, step: 'understand' });
        await updateRun(run, { status: 'researching', currentStep: 'research' });
        onEvent?.({ type: 'step.started', runId: run.id, step: 'research' });
        const researchStep = await createStep(run, { stepKey: 'research', type: 'research' });
        await startStep(researchStep);
        const researched = await research({ userId, intent: analyzed.intent, context });
        if (researched.status === 'ambiguous') {
            await completeStep(researchStep, { result: { status: 'ambiguous', type: researched.type } });
            const reply = await saveClarification({
                session,
                run,
                type: researched.type,
                candidates: researched.candidates,
                text: `I found multiple ${researched.type}s that match. Which one should I use?`
            });
            return { handled: true, replyObj: reply, totalTokenUsage: totalUsage };
        }
        if (researched.status === 'not_found') {
            await updateRun(run, { status: 'blocked', currentStep: 'research', error: { code: 'AGENT_RESOURCE_NOT_FOUND', message: `I could not find the ${researched.type} "${researched.query}".` } });
            const reply = await saveReply(session, { text: `I could not find the ${researched.type} "${researched.query}". Please choose an existing resource or ask me to create a new one.`, kind: 'error', payload: { runId: run.id, code: 'AGENT_RESOURCE_NOT_FOUND' } });
            return { handled: true, replyObj: reply, totalTokenUsage: totalUsage };
        }
        await completeStep(researchStep, { result: researched.resources.map(item => item.resource) });
        onEvent?.({ type: 'step.completed', runId: run.id, step: 'research' });

        const form = resourceByType(researched.resources, 'form');
        const workflow = resourceByType(researched.resources, 'workflow');
        const actor = context.actorEmail ? { email: context.actorEmail } : await User.findByPk(userId, { attributes: ['email'] });
        const capabilityRegistry = createSolutionCapabilityRegistry({
            run,
            session,
            message,
            form,
            workflow,
            resources: researched.resources,
            intent: analyzed.intent,
            clarificationMode: persistedContext.clarificationMode,
            formTurnContext: formTurnContextForAgent({ message, context: persistedContext }),
            userId,
            actorEmail: actor?.email || null,
            onEvent
        });

        const planned = approvedPlan
            ? { plan: approvedPlan, tokenUsage: {} }
            : await planSolution({
                intent: analyzed.intent,
                clarificationMode: persistedContext.clarificationMode,
                onActivity: event => onEvent?.(event)
            });
        const plan = planned.plan;
        const planUsage = planned.tokenUsage;
        totalUsage = addUsage(totalUsage, planUsage);
        await updateRun(run, { status: 'planning', plan, tokenUsage: totalUsage });
        onEvent?.({ type: 'plan.ready', runId: run.id, plan });
        const planStep = await createStep(run, { stepKey: 'plan', type: 'plan' });
        await startStep(planStep);
        await completeStep(planStep, { result: plan, tokenUsage: planUsage });

        if (!skipPlanReview && shouldPauseForPlanReview(message)) {
            await updateRun(run, {
                status: 'awaiting_clarification',
                currentStep: 'plan_review',
                metadata: { ...(run.metadata || {}), planReviewRequested: true }
            });
            await replaceChatSessionState(session, { status: 'awaiting_agent_plan_review', runId: run.id });
            const reply = await saveReply(session, {
                text: plan.summary || 'I prepared a plan for your review before continuing.',
                kind: 'agent_plan_review',
                payload: { runId: run.id, plan },
                tokenUsage: totalUsage
            });
            return { handled: true, replyObj: reply, totalTokenUsage: totalUsage };
        }

        await updateRun(run, { status: 'designing', currentStep: 'design' });
        onEvent?.({ type: 'step.started', runId: run.id, step: 'design' });
        const compiled = compilePlanWithRepair({ plan, intent: analyzed.intent, registry: capabilityRegistry });
        totalUsage = addUsage(totalUsage, compiled.tokenUsage);
        const executablePlan = {
            ...compiled.plan,
            steps: compiled.graph.steps,
            execution: compiled.graph
        };
        await updateRun(run, { plan: executablePlan, tokenUsage: totalUsage });
        const adaptivePlanner = {
            plan: async () => executablePlan,
            replan: async ({ plan: currentPlan, observation }) => {
                const repaired = await repairExecutionPlan({
                    plan: currentPlan,
                    intent: analyzed.intent,
                    issues: observation?.issues || [{ code: 'RUNTIME_REPLAN_REQUESTED', message: observation?.message || 'The runtime requested a new plan.' }],
                    preserveOutcomes: false,
                    onActivity: event => onEvent?.(event)
                });
                const next = compileExecutionPlan({ plan: repaired.plan, registry: capabilityRegistry });
                if (!next.valid) {
                    const error = new Error('The replanned operation is not executable.');
                    error.code = 'AGENT_PLAN_INVALID';
                    error.issues = next.issues;
                    throw error;
                }
                return {
                    plan: {
                        ...repaired.plan,
                        ...(isMaterialPlanChange(currentPlan, repaired.plan) ? { materialPlanChange: true } : {}),
                        steps: next.graph.steps,
                        execution: next.graph
                    },
                    tokenUsage: repaired.tokenUsage
                };
            }
        };
        const runtime = createAgentRuntime({
            registry: capabilityRegistry,
            planner: adaptivePlanner,
            limits: { maxActions: env.aiAgentMaxActions, maxReplans: env.aiAgentMaxReplans },
            onEvent: event => {
                const typeMap = {
                    step_started: 'step.started',
                    step_observed: 'step.completed',
                    plan_revised: 'plan.revised'
                };
                onEvent?.({ ...event, type: typeMap[event.type] || event.type, runId: run.id });
            }
        });
        const runtimeResult = await runtime.run({
            input: { message, intent: analyzed.intent, context: persistedContext },
            state: { resources: researched.resources.map(item => item.resource) },
            plan: executablePlan
        });
        totalUsage = addUsage(totalUsage, runtimeResult.tokenUsage);
        await updateRun(run, {
            plan: {
                ...executablePlan,
                steps: runtimeResult.plan.steps,
                execution: { ...compiled.graph, steps: runtimeResult.plan.steps }
            },
            tokenUsage: totalUsage,
            metadata: {
                ...(run.metadata || {}),
                runtime: {
                    actionCount: runtimeResult.actionCount,
                    replanCount: runtimeResult.replanCount,
                    observations: (runtimeResult.state.observations || []).map(observation => ({
                        stepId: observation.stepId,
                        type: observation.type,
                        status: observation.status,
                        message: observation.message || null,
                        reason: observation.reason || null,
                        issues: observation.issues || []
                    }))
                }
            }
        });

        if (runtimeResult.status === 'awaiting_clarification') {
            const clarificationResult = Object.values(runtimeResult.state.outputs || {})
                .map(output => output?.result)
                .find(result => result?.status === 'clarification');
            if (!clarificationResult) {
                throw new Error('The agent requested clarification without a usable question.');
            }
            const formTurn = clarificationResult.result || clarificationResult;
            await updateRun(run, { status: 'awaiting_clarification', tokenUsage: totalUsage });
            await replaceChatSessionState(session, { status: 'awaiting_agent_clarification', runId: run.id });
            const reply = await saveReply(session, {
                text: formTurn.message,
                kind: 'clarification',
                payload: { runId: run.id, options: formTurn.inputs || formTurn.options || [], allowDecide: true },
                tokenUsage: totalUsage
            });
            return { handled: true, replyObj: reply, totalTokenUsage: totalUsage };
        }

        if (runtimeResult.status === 'blocked') {
            const error = new Error(runtimeResult.observation?.message || 'The generated solution could not be verified.');
            error.code = 'AGENT_VERIFICATION_FAILED';
            error.issues = runtimeResult.observation?.issues || [];
            throw error;
        }

        if (runtimeResult.plan.materialPlanChange === true) {
            await updateRun(run, {
                status: 'awaiting_clarification',
                currentStep: 'plan_review',
                plan: runtimeResult.plan,
                metadata: { ...(run.metadata || {}), planReviewRequested: true }
            });
            await replaceChatSessionState(session, { status: 'awaiting_agent_plan_review', runId: run.id });
            const reply = await saveReply(session, {
                text: 'The runtime found a material change in the approach. Please review the updated outcome plan before I continue.',
                kind: 'agent_plan_review',
                payload: { runId: run.id, plan: runtimeResult.plan },
                tokenUsage: totalUsage
            });
            return { handled: true, replyObj: reply, totalTokenUsage: totalUsage };
        }

        const artifacts = getRunArtifacts(run);
        const artifactIds = artifacts.map(artifact => artifact.id).filter(Boolean);
        if (artifactIds.length === 0) {
            await updateRun(run, { status: 'completed', currentStep: null, tokenUsage: totalUsage });
            const reply = await saveReply(session, { text: 'I understood the request, but it does not yet contain enough detail to design a form or workflow.', kind: 'clarification', payload: { runId: run.id, intent: analyzed.intent, plan } });
            return { handled: true, replyObj: reply, totalTokenUsage: totalUsage };
        }

        await updateRun(run, { status: 'verifying', currentStep: 'solution_verify', tokenUsage: totalUsage });
        const verifyStep = await createStep(run, { stepKey: 'solution_verify', type: 'solution_verify', inputArtifactIds: artifactIds });
        await startStep(verifyStep);
        const verification = verifySolutionArtifacts(run, analyzed.intent);
        if (verification.status === 'blocked') {
            const error = new Error('The generated solution failed verification.');
            error.code = 'AGENT_VERIFICATION_FAILED';
            error.issues = verification.issues;
            await failStep(verifyStep, error);
            throw error;
        }
        await completeStep(verifyStep, { result: verification });

        await updateRun(run, { status: 'awaiting_approval', currentStep: null, tokenUsage: totalUsage });
        onEvent?.({ type: 'approval.required', runId: run.id, artifactIds });
        await replaceChatSessionState(session, { status: 'awaiting_agent_approval', runId: run.id });
        const firstArtifact = artifacts.find(artifact => artifact.type === 'form_proposal') || artifacts[0];
        const kind = artifacts.length > 1 ? 'solution_proposal' : firstArtifact.type === 'form_proposal' ? 'form_proposal' : 'workflow_proposal';
        const content = firstArtifact.content;
        const payload = {
            ...content,
            runId: run.id,
            plan: {
                ...executablePlan,
                outcomes: executablePlan.outcomes || []
            },
            artifactIds,
            solution: artifacts.map(artifact => ({ id: artifact.id, type: artifact.type, content: artifact.content })),
            verification
        };
        if (kind === 'form_proposal' || kind === 'solution_proposal') {
            const supersededMessageIds = await supersedePendingChatFormProposals({
                threadId: session.id,
                formId: payload.formId || null
            });
            if (supersededMessageIds.length > 0) payload.supersededMessageIds = supersededMessageIds;
        }
        const reply = await saveReply(session, {
            text: plan.summary || 'I prepared a solution for your review.',
            kind,
            payload,
            tokenUsage: totalUsage,
            proposalStatus: 'pending'
        });
        await updateRun(run, { metadata: { ...(run.metadata || {}), proposalMessageId: reply.id, approvedOutcomeFingerprint: planFingerprint(executablePlan) } });
        onEvent?.({ type: 'run.completed', runId: run.id, status: 'awaiting_approval' });
        return { handled: true, replyObj: reply, totalTokenUsage: totalUsage };
    } catch (error) {
        const failure = makeError(error);
        await updateRun(run, { status: 'failed', error: failure, currentStep: null, tokenUsage: totalUsage });
        const reply = await saveReply(session, { text: failure.message, kind: 'error', payload: { runId: run.id, code: failure.code, issues: failure.issues }, tokenUsage: totalUsage });
        return { handled: true, replyObj: reply, totalTokenUsage: totalUsage };
    }
};

export const resumeAgentAfterForm = async ({ run, session, userId, formId, onEvent = null }) => {
    const metadata = run.metadata || {};
    const request = metadata.request;
    const context = metadata.context || {};
    const form = await Form.findOne({ where: { id: formId, userId } });
    if (!form) throw new Error('The approved form could not be found.');
    const existingWorkflow = context.workflowId ? await Workflow.findOne({ where: { id: context.workflowId, userId } }) : null;
    const result = await designWorkflow({
        run,
        userId,
        message: request,
        workflow: existingWorkflow,
        form,
        formArtifactId: null,
        turnContext: workflowTurnContextForAgent({ message: request, context, intent: run.intent, form }),
        onEvent
    });
    if (result.status === 'clarification') {
        await updateRun(run, { status: 'awaiting_clarification', currentStep: 'design_workflow', tokenUsage: result.tokenUsage || {} });
        await replaceChatSessionState(session, { status: 'awaiting_agent_clarification', runId: run.id });
        const reply = await saveReply(session, {
            text: result.result.message,
            kind: 'clarification',
            payload: { runId: run.id, options: result.result.inputs || [], allowDecide: true },
            tokenUsage: result.tokenUsage || {}
        });
        return { reply, tokenUsage: result.tokenUsage || {} };
    }
    await updateRun(run, { status: 'awaiting_approval', currentStep: null, metadata: { ...metadata, formId } });
    const artifact = result.artifact;
    const reply = await saveReply(session, {
        text: 'The workflow is ready for your review.',
        kind: 'workflow_proposal',
        payload: { ...artifact.content, runId: run.id, plan: run.plan, artifactIds: [artifact.id], formId },
        tokenUsage: result.tokenUsage,
        proposalStatus: 'pending'
    });
    await updateRun(run, { metadata: { ...metadata, formId, proposalMessageId: reply.id } });
    return { reply, tokenUsage: result.tokenUsage };
};

export const resumeAgentAfterClarification = async ({ run, session, userId, answer = '', state = null, context = null, onEvent = null }) => {
    const metadata = run.metadata || {};
    const request = metadata.request;
    if (!request) throw new Error('The pending agent request is no longer available.');

    // The browser context only contains the most recent UI state. Preserve
    // the run's original context as well so a clarification cannot discard
    // the selected form, workflow, or other trusted inputs from the request.
    const nextContext = { ...(metadata.context || {}), ...(context || {}) };
    // A later user answer must take authority back from an earlier
    // "decide for me" request. Keep delegation scoped to the one resume turn.
    nextContext.clarificationDecision = context?.clarificationDecision === 'decide_for_me'
        ? 'decide_for_me'
        : null;
    nextContext.clarificationId = context?.clarificationId || null;
    nextContext.clarificationAnswers = [
        ...(Array.isArray(nextContext.clarificationAnswers) ? nextContext.clarificationAnswers : []),
        String(answer || '').trim()
    ].filter(Boolean).slice(-8);
    const structuredState = state && typeof state === 'object' && !Array.isArray(state) ? state : {};
    if (Object.keys(structuredState).length > 0) {
        nextContext.clarificationState = structuredState;
        nextContext.clarificationText = String(answer || '').trim();
    }
    const workflowClarification = metadata.workflowClarification;
    if (workflowClarification?.kind === 'respondent_email_field') {
        const normalizedAnswer = String(answer || '').trim().toLowerCase();
        const selected = (workflowClarification.candidates || []).find((candidate, index) => (
            normalizedAnswer === String(index + 1)
            || normalizedAnswer === String(candidate.id || '').toLowerCase()
            || normalizedAnswer === String(candidate.label || '').trim().toLowerCase()
        ));
        if (selected?.id) {
            nextContext.respondentEmailFieldId = selected.id;
            await updateRun(run, {
                metadata: {
                    ...metadata,
                    workflowClarification: null,
                    context: nextContext
                }
            });
        }
    }

    return processAgenticTurn({
        run,
        session,
        userId,
        message: request,
        context: nextContext,
        force: true,
        onEvent
    });
};

export const resumeAgentAfterPlanReview = async ({ run, session, userId, onEvent = null }) => {
    const metadata = run.metadata || {};
    const request = metadata.request;
    if (!request) throw new Error('The pending plan request is no longer available.');

    return processAgenticTurn({
        run,
        session,
        userId,
        message: request,
        context: metadata.context || {},
        force: true,
        skipPlanReview: true,
        approvedPlan: run.plan,
        onEvent
    });
};

export { saveReply as saveAgentReply, messagePayload as agentMessagePayload };
