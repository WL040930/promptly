import { ChatMessage, ExecutionLog, Form, Workflow } from '../../models/index.js';
import { runFormTurn } from '../ai/formAIService.js';
import {
    assembleWorkflow,
    classifyRequest,
    compactWorkflowSnapshot,
    loadWorkflowResourceContext,
    patchWorkflow,
    requiredCapabilitiesForRequest
} from '../ai/workflow/workflowAgentService.js';
import NodeRegistry from '../../utils/NodeRegistry.js';
import { resolveResource } from '../chat/resourceResolver.js';
import { addUsage, requestAgentJson } from './agentAi.js';
import { createAgentCapabilityRegistry } from './agentCapabilityRegistry.js';
import { createAgentRuntime } from './agentRuntime.js';
import env from '../../config/env.js';
import { makeError, makeIntent } from './agentContracts.js';
import {
    compileExecutionPlan,
    makeAdaptivePlan,
    makeFallbackOutcomePlan,
    isMaterialPlanChange,
    planFingerprint
} from './agentPlanCompiler.js';
import { DEFAULT_CLARIFICATION_MODE, getClarificationModeInstruction, normalizeClarificationMode } from '../../../shared/agentContract.js';
import { supersedePendingChatFormProposals } from '../proposalLifecycle.js';
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

export const shouldPauseForPlanReview = (message, intent = null) => (
    (intent?.domains || []).includes('form')
    && (intent?.domains || []).includes('workflow')
) || planReviewPattern.test(String(message || ''));

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
    const message = await ChatMessage.create({
        sessionId: session.id,
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

const deterministicIntent = ({ message, context = {} }) => {
    const text = String(message || '');
    const domains = [];
    if (/\b(form|survey|field|question|response)\b/i.test(text)) domains.push('form');
    if (/\b(workflow|automation|trigger|node|email|sheet|webhook|database)\b/i.test(text)) domains.push('workflow');
    if (/\b(execution|run|failed|failure|error|diagnos)\b/i.test(text)) domains.push('execution');
    if (/\b(connect|integration|google|gmail|sheets|webhook)\b/i.test(text)) domains.push('integration');
    if (context.formId && !domains.includes('form')) domains.push('form');
    if (context.workflowId && !domains.includes('workflow')) domains.push('workflow');
    if (context.executionId && !domains.includes('execution')) domains.push('execution');
    const isDeletion = /\b(delete|remove|clear)\b/i.test(text);
    const isModification = /\b(modify|update|change|add|remove|edit|improve)\b/i.test(text);
    const isActionRequest = /\b(create|build|design|draft|make|set up|setup|automate|connect|i need|i want|please)\b/i.test(text);
    return makeIntent({
        goal: isDeletion ? 'delete' : isModification ? 'modify' : isActionRequest ? 'create' : 'explain',
        domains,
        resourceReferences: [
            context.formId ? { type: 'form', query: context.formId } : null,
            context.workflowId ? { type: 'workflow', query: context.workflowId } : null,
            context.executionId ? { type: 'execution', query: context.executionId } : null
        ].filter(Boolean),
        requirements: [text],
        confidence: 0.45,
        risk: /\b(remove|delete|disconnect)\b/i.test(text) ? 'high' : 'medium'
    });
};

const analyzeIntent = async ({ message, context }) => {
    const fallback = deterministicIntent({ message, context });
    if (fallback.goal === 'delete') return { intent: fallback, tokenUsage: {} };
    try {
        const result = await requestAgentJson({
            label: 'intent',
            prompt: [
                'User request:', message,
                '',
                'Selected UI context:', JSON.stringify({ formId: context.formId || null, workflowId: context.workflowId || null, executionId: context.executionId || null }),
                '',
                'Return the typed intent. Keep requirements concise.'
            ].join('\n')
        });
        const intent = makeIntent(result.value);
        if (intent.domains.length === 0) return { intent: fallback, tokenUsage: result.tokenUsage };
        return { intent, tokenUsage: result.tokenUsage };
    } catch {
        return { intent: fallback, tokenUsage: {} };
    }
};

const research = async ({ userId, intent, context }) => {
    const resources = [];
    const seen = new Set();
    const references = [
        context.formId ? { type: 'form', query: context.formId } : null,
        context.workflowId ? { type: 'workflow', query: context.workflowId } : null,
        context.executionId ? { type: 'execution', query: context.executionId } : null,
        ...(intent.resourceReferences || [])
    ].filter(Boolean);

    for (const reference of references) {
        const key = `${reference.type}:${reference.query}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const result = await resolveResource({ userId, type: reference.type, reference: reference.query });
        if (result.status === 'ambiguous') return { status: 'ambiguous', type: reference.type, candidates: result.candidates };
        if (result.status === 'not_found' && intent.goal === 'modify') {
            return { status: 'not_found', type: reference.type, query: reference.query };
        }
        if (result.status === 'resolved') {
            const resourceModel = reference.type === 'form' ? Form : reference.type === 'workflow' ? Workflow : ExecutionLog;
            const resource = await resourceModel.findOne({ where: { id: result.resource.id, userId } });
            if (!resource) continue;
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
        }
    }
    return { status: 'resolved', resources };
};

const resourceByType = (resources, type) => resources.find(item => item.type === type)?.full || null;

const planSolution = async ({ intent, resources, availableCapabilities = [], clarificationMode = DEFAULT_CLARIFICATION_MODE }) => {
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
                'Available capabilities:', JSON.stringify(availableCapabilities),
                '',
                'Clarification:', `${clarificationMode} - ${getClarificationModeInstruction(clarificationMode)}`,
                '',
                'Create a short outcome plan and flexible executable capability steps. Preserve useful step IDs and dependencies. Do not add a verify or approval step; verification and approval are runtime policies.'
            ].join('\n')
        });
        return { plan: makeAdaptivePlan(result.value, intent), tokenUsage: result.tokenUsage };
    } catch {
        return { plan: makeFallbackOutcomePlan(intent), tokenUsage: {} };
    }
};

const formHistory = async sessionId => {
    const messages = await ChatMessage.findAll({
        where: { sessionId },
        order: [['createdAt', 'DESC']],
        limit: 12,
        attributes: ['sender', 'text']
    });
    return messages.reverse().map(message => ({ sender: message.sender, text: message.text }));
};

const designForm = async ({ run, session, message, form, clarificationMode = DEFAULT_CLARIFICATION_MODE }) => {
    const step = await createStep(run, { stepKey: 'design_form', type: 'design_form' });
    await startStep(step);
    try {
        const requiredCapabilities = requiredCapabilitiesForRequest(message);
        const request = requiredCapabilities.includes('respondent_confirmation')
            ? `${message}\n\nImplementation requirement: include at least one required email field so the respondent can receive the requested confirmation.`
            : message;
        const result = await runFormTurn({
            request,
            currentSchema: form?.toJSON?.() || form || {},
            history: await formHistory(session.id),
            clarificationMode
        });
        if (result.kind === 'reply' || result.kind === 'clarification') {
            await completeStep(step, { result, tokenUsage: result.tokenUsage || {} });
            return { status: 'clarification', result, tokenUsage: result.tokenUsage || {} };
        }
        const schema = requiredCapabilitiesForRequest(message).includes('respondent_confirmation')
            ? ensureRespondentEmailField(result.schema || {})
            : result.schema;
        const content = {
            action: form ? 'edit_form' : 'create_form',
            formId: form?.id || null,
            schema,
            patches: result.patches || [],
            requirements: result.requirements || [],
            verification: result.verification || null,
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

const designWorkflow = async ({ run, userId, message, workflow, form, formSchema = null, formArtifactId = null, formBinding = null, onEvent = null }) => {
    const step = await createStep(run, { stepKey: 'design_workflow', type: 'design_workflow' });
    await startStep(step);
    try {
        const requiredCapabilities = requiredCapabilitiesForRequest(message);
        onEvent?.({ type: 'workflow.design.started', runId: run.id, stage: 'classify' });
        const classification = await classifyRequest({ message, snapshot: compactWorkflowSnapshot(workflow) });
        onEvent?.({ type: 'workflow.design.progress', runId: run.id, stage: 'classify', selectedNodeKeys: classification.selectedNodeKeys });
        if (classification.action === 'edit_workflow' && workflow) {
            const selected = [...(classification.selectedNodeKeys || [])];
            const affected = (workflow.nodes || [])
                .filter(node => classification.affectedNodeIds.includes(node.id))
                .map(node => `${node.type}:${node.subType}`);
            const specs = NodeRegistry.getSchemasFor([...selected, ...affected]);
            const resourceContext = await loadWorkflowResourceContext({ userId, specs });
            onEvent?.({ type: 'workflow.design.progress', runId: run.id, stage: 'patch', resourceCount: Object.keys(resourceContext).length });
            const patched = await patchWorkflow({
                message,
                currentWorkflow: workflow.toJSON(),
                classification,
                specs,
                resourceContext,
                formSchema: form?.toJSON?.() || form || formSchema || null,
                requiredCapabilities
            });
            const content = {
                action: 'edit_workflow',
                workflowId: workflow.id,
                nodes: patched.nodes,
                edges: patched.edges,
                diff: patched.diff,
                baseWorkflowUpdatedAt: workflow.updatedAt,
                formArtifactId,
                ...(formBinding ? { resourceBindings: [formBinding] } : {}),
                readiness: patched.readiness
            };
            const artifact = await createArtifact({
                run,
                type: 'workflow_proposal',
                artifactKey: 'workflow_proposal',
                content,
                baseResources: [{ type: 'workflow', id: workflow.id, updatedAt: workflow.updatedAt }]
            });
            const tokenUsage = addUsage(classification.tokenUsage, patched.tokenUsage);
            await completeStep(step, { result: { artifactId: artifact.id }, outputArtifactIds: [artifact.id], tokenUsage });
            return { artifact, tokenUsage };
        }

        const specs = NodeRegistry.getSchemasFor(classification.selectedNodeKeys || classification.selectedSubTypes);
        const resourceContext = await loadWorkflowResourceContext({ userId, specs });
        onEvent?.({ type: 'workflow.design.progress', runId: run.id, stage: 'assemble', resourceCount: Object.keys(resourceContext).length });
        const assembled = await assembleWorkflow({
            message,
            specs,
            workflowName: classification.workflowName,
            formId: form?.id || null,
            formSchema: form?.toJSON?.() || form || formSchema || null,
            formBinding,
            requiredCapabilities,
            resourceContext
        });
        const content = {
            action: 'create_workflow',
            name: assembled.name,
            intent: classification.intent,
            needsForm: classification.needsForm,
            formId: form?.id || null,
            formArtifactId,
            ...(formBinding ? { resourceBindings: assembled.resourceBindings || [formBinding] } : {}),
            nodes: assembled.nodes,
            edges: assembled.edges,
            readiness: assembled.readiness,
            plan: assembled.nodes.map(node => ({ subType: node.subType, title: node.title, reason: node.description }))
        };
        const artifact = await createArtifact({
            run,
            type: 'workflow_proposal',
            artifactKey: 'workflow_proposal',
            content,
            baseResources: workflow ? [{ type: 'workflow', id: workflow.id, updatedAt: workflow.updatedAt }] : []
        });
        const tokenUsage = addUsage(classification.tokenUsage, assembled.tokenUsage);
        await completeStep(step, { result: { artifactId: artifact.id }, outputArtifactIds: [artifact.id], tokenUsage });
        return { artifact, tokenUsage };
    } catch (error) {
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
    clarificationMode,
    userId,
    onEvent
}) => createAgentCapabilityRegistry([
    {
        name: 'research',
        description: 'Use the already-resolved account resources for this run.',
        risk: 'read',
        execute: async () => ({ output: { resources: resources.map(item => item.resource) } })
    },
    {
        name: 'design_form',
        description: 'Prepare a reviewable form proposal.',
        risk: 'proposal',
        execute: async () => {
            const result = await designForm({ run, session, message, form, clarificationMode });
            if (result.status === 'clarification') {
                return {
                    status: 'awaiting_clarification',
                    message: result.result.message,
                    output: { result },
                    tokenUsage: result.tokenUsage
                };
            }
            return {
                output: { artifact: result.artifact },
                tokenUsage: result.tokenUsage
            };
        }
    },
    {
        name: 'design_workflow',
        description: 'Prepare a reviewable workflow proposal.',
        risk: 'proposal',
        execute: async ({ context }) => {
            const formProposal = context.state.outputs.design_form?.artifact || null;
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
                onEvent
            });
            return {
                output: { artifact: result.artifact },
                tokenUsage: result.tokenUsage
            };
        }
    }
]);

const verifySolutionArtifacts = run => {
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

const repairExecutionPlan = async ({ plan, intent, issues, preserveOutcomes = true }) => {
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
        ].join('\n')
    });
    return {
        plan: makeAdaptivePlan({ ...result.value, ...(preserveOutcomes ? { outcomes: plan.outcomes } : {}) }, intent),
        tokenUsage: result.tokenUsage || {}
    };
};

const compilePlanWithRepair = async ({ plan, intent, registry }) => {
    let currentPlan = plan;
    let tokenUsage = {};
    let lastResult = null;
    for (let attempt = 0; attempt <= 2; attempt += 1) {
        lastResult = compileExecutionPlan({ plan: currentPlan, registry });
        if (lastResult.valid) {
            return { plan: currentPlan, graph: lastResult.graph, tokenUsage };
        }
        if (attempt === 2) break;
        try {
            const repaired = await repairExecutionPlan({ plan: currentPlan, intent, issues: lastResult.issues });
            currentPlan = repaired.plan;
            tokenUsage = addUsage(tokenUsage, repaired.tokenUsage);
        } catch {
            break;
        }
    }
    const error = new Error('The requested operation needs clarification before it can be executed.');
    error.code = 'AGENT_PLAN_UNSUPPORTED';
    error.issues = lastResult?.issues || [];
    error.tokenUsage = tokenUsage;
    throw error;
};

const savePlanCapabilityClarification = async ({ session, run, plan, error, tokenUsage }) => {
    await updateRun(run, {
        status: 'awaiting_clarification',
        currentStep: 'plan',
        error: { code: error.code, message: error.message, issues: error.issues || [] },
        tokenUsage,
        plan
    });
    await session.update({ agentState: { status: 'awaiting_agent_clarification', runId: run.id } });
    const capabilities = [...new Set((error.issues || [])
        .map(item => item.capability)
        .filter(Boolean))];
    const text = capabilities.length > 0
        ? `I can continue with the supported parts, but I cannot execute ${capabilities.join(', ')} yet. Please choose a supported alternative or remove that part of the request.`
        : error.message;
    return saveReply(session, {
        text,
        kind: 'clarification',
        payload: { runId: run.id, plan, issues: error.issues || [], capabilities },
        tokenUsage
    });
};

const saveClarification = async ({ session, run, type, candidates, text }) => {
    await updateRun(run, { status: 'awaiting_clarification', currentStep: 'research' });
    await session.update({ agentState: { status: 'awaiting_agent_clarification', runId: run.id } });
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

export const processAgenticTurn = async ({ session, userId, message, context = {}, run: existingRun = null, force = false, skipPlanReview = false, approvedPlan = null, onEvent = null }) => {
    // Intent classification is the routing seam. The old implementation used
    // a fixed keyword gate here, which made natural-language requests fall
    // into a different agent. Keep the exported predicate for compatibility,
    // but let the typed classifier decide whether this is an agentic turn.
    const preAnalyzed = !force ? await analyzeIntent({ message, context }) : null;
    const isActionable = ['create', 'modify', 'connect'].includes(preAnalyzed?.intent?.goal)
        && preAnalyzed?.intent?.domains?.length > 0;
    if (!force && !isActionable) return { handled: false };

    const persistedContext = {
        surface: context.surface || 'chat',
        formId: context.formId || null,
        workflowId: context.workflowId || null,
        executionId: context.executionId || null,
        activeResource: context.activeResource || null,
        clarificationMode: normalizeClarificationMode(context.clarificationMode)
    };
    const run = existingRun || await createRun({ sessionId: session.id, userId, metadata: { request: message, context: persistedContext } });
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
        const analyzed = preAnalyzed || await analyzeIntent({ message, context });
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
        const capabilityRegistry = createSolutionCapabilityRegistry({
            run,
            session,
            message,
            form,
            workflow,
            resources: researched.resources,
            clarificationMode: persistedContext.clarificationMode,
            userId,
            onEvent
        });

        const planned = approvedPlan
            ? { plan: approvedPlan, tokenUsage: {} }
            : await planSolution({
                intent: analyzed.intent,
                resources: researched.resources,
                availableCapabilities: capabilityRegistry.list().map(capability => ({ name: capability.name, description: capability.description, risk: capability.risk, produces: capability.produces })),
                clarificationMode: persistedContext.clarificationMode
            });
        const plan = planned.plan;
        const planUsage = planned.tokenUsage;
        totalUsage = addUsage(totalUsage, planUsage);
        await updateRun(run, { status: 'planning', plan, tokenUsage: totalUsage });
        onEvent?.({ type: 'plan.ready', runId: run.id, plan });
        const planStep = await createStep(run, { stepKey: 'plan', type: 'plan' });
        await startStep(planStep);
        await completeStep(planStep, { result: plan, tokenUsage: planUsage });

        if (!skipPlanReview && shouldPauseForPlanReview(message, analyzed.intent)) {
            await updateRun(run, {
                status: 'awaiting_clarification',
                currentStep: 'plan_review',
                metadata: { ...(run.metadata || {}), planReviewRequested: true }
            });
            await session.update({ agentState: { status: 'awaiting_agent_plan_review', runId: run.id } });
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
        let compiled;
        try {
            compiled = await compilePlanWithRepair({ plan, intent: analyzed.intent, registry: capabilityRegistry });
        } catch (error) {
            totalUsage = addUsage(totalUsage, error.tokenUsage || {});
            if (error.code === 'AGENT_PLAN_UNSUPPORTED') {
                const reply = await savePlanCapabilityClarification({ session, run, plan, error, tokenUsage: totalUsage });
                return { handled: true, replyObj: reply, totalTokenUsage: totalUsage };
            }
            throw error;
        }
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
                    preserveOutcomes: false
                });
                const next = compileExecutionPlan({ plan: repaired.plan, registry: capabilityRegistry });
                if (!next.valid) {
                    const error = new Error('The replanned operation is not executable.');
                    error.code = 'AGENT_PLAN_UNSUPPORTED';
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
            await session.update({ agentState: { status: 'awaiting_agent_clarification', runId: run.id } });
            const reply = await saveReply(session, {
                text: formTurn.message,
                kind: 'clarification',
                payload: { runId: run.id, options: formTurn.inputs || formTurn.options || [] },
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
            await session.update({ agentState: { status: 'awaiting_agent_plan_review', runId: run.id } });
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
        const verification = verifySolutionArtifacts(run);
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
        await session.update({ agentState: { status: 'awaiting_agent_approval', runId: run.id } });
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
                sessionId: session.id,
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
    const result = await designWorkflow({ run, userId, message: request, workflow: existingWorkflow, form, formArtifactId: null, onEvent });
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

export const resumeAgentAfterClarification = async ({ run, session, userId, answer = '', context = null, onEvent = null }) => {
    const metadata = run.metadata || {};
    const request = metadata.request;
    if (!request) throw new Error('The pending agent request is no longer available.');

    return processAgenticTurn({
        run,
        session,
        userId,
        message: answer ? `${request}\n\nUser clarification: ${answer}` : request,
        context: context || metadata.context || {},
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
