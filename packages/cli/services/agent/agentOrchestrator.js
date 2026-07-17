import { ChatMessage, Form, Workflow } from '../../models/index.js';
import { generateFormFromPrompt } from '../ai/aiFormsService.js';
import {
    assembleWorkflow,
    classifyRequest,
    compactWorkflowSnapshot,
    patchWorkflow
} from '../ai/workflowAgentService.js';
import NodeRegistry from '../../utils/NodeRegistry.js';
import { resolveResource } from '../chat/resourceResolver.js';
import { addUsage, requestAgentJson } from './agentAi.js';
import { makeError, makeIntent, makePlan } from './agentContracts.js';
import { DEFAULT_CLARIFICATION_MODE, normalizeClarificationMode } from '../../../shared/agentContract.js';
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

const buildRequestPattern = /\b(create|build|design|make|set up|setup|automate|connect|modify|update|change|add|remove|delete|edit|improve|i need|i want|help me|when .* then|after .* send)\b/i;
const domainPattern = /\b(form|survey|workflow|automation|trigger|field|email|sheet|sheets|webhook|database)\b/i;
const planReviewPattern = /(?:\b(show|give|provide|present|review|explain|outline|draft)\b.{0,50}\b(plan|steps|approach)\b|\b(plan|steps|approach)\b.{0,50}\b(before|first|review|approve|proceed)\b|\bplan first\b)/i;

export const shouldPauseForPlanReview = message => planReviewPattern.test(String(message || ''));

export const shouldUseAgenticPath = message => Boolean(
    String(message || '').match(domainPattern)
    && (String(message || '').match(buildRequestPattern) || shouldPauseForPlanReview(message))
);

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
    if (/\b(connect|integration|google|gmail|sheets|webhook)\b/i.test(text)) domains.push('integration');
    if (context.formId && !domains.includes('form')) domains.push('form');
    if (context.workflowId && !domains.includes('workflow')) domains.push('workflow');
    return makeIntent({
        goal: /\b(modify|update|change|add|remove|delete|edit|improve)\b/i.test(text) ? 'modify' : 'create',
        domains,
        resourceReferences: [
            context.formId ? { type: 'form', query: context.formId } : null,
            context.workflowId ? { type: 'workflow', query: context.workflowId } : null
        ].filter(Boolean),
        requirements: [text],
        confidence: 0.45,
        risk: /\b(remove|delete|disconnect)\b/i.test(text) ? 'high' : 'medium'
    });
};

const analyzeIntent = async ({ message, context }) => {
    const fallback = deterministicIntent({ message, context });
    try {
        const result = await requestAgentJson({
            label: 'intent',
            maxCompletionTokens: 700,
            prompt: [
                'User request:', message,
                '',
                'Selected UI context:', JSON.stringify({ formId: context.formId || null, workflowId: context.workflowId || null }),
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
            const resource = reference.type === 'form'
                ? await Form.findOne({ where: { id: result.resource.id, userId } })
                : await Workflow.findOne({ where: { id: result.resource.id, userId } });
            if (!resource) continue;
            resources.push({
                type: reference.type,
                id: resource.id,
                resource: reference.type === 'form' ? compactForm(resource) : compactWorkflow(resource),
                full: resource
            });
        }
    }
    return { status: 'resolved', resources };
};

const resourceByType = (resources, type) => resources.find(item => item.type === type)?.full || null;

const planSolution = async ({ intent, resources, clarificationMode = DEFAULT_CLARIFICATION_MODE }) => {
    const needsModelPlan = intent.goal === 'modify'
        || intent.risk === 'high'
        || intent.domains.length > 1
        || intent.requirements.length > 2;
    if (!needsModelPlan) return { plan: makePlan({}, intent), tokenUsage: {} };
    try {
        const result = await requestAgentJson({
            label: 'plan',
            maxCompletionTokens: 1000,
            prompt: [
                'Typed intent:', JSON.stringify(intent),
                '',
                'Resolved resources:', JSON.stringify(resources.map(item => item.resource)),
                '',
                'Clarification mode:', clarificationMode,
                '',
                'Create a short dependency-aware plan. Include verification and approval.'
            ].join('\n')
        });
        return { plan: makePlan(result.value, intent), tokenUsage: result.tokenUsage };
    } catch {
        return { plan: makePlan({}, intent), tokenUsage: {} };
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
        const result = await generateFormFromPrompt(
            message,
            form?.toJSON?.() || form || {},
            await formHistory(session.id),
            null,
            { clarificationMode }
        );
        if (result.type === 'message') {
            await completeStep(step, { result, tokenUsage: result.tokenUsage || {} });
            return { status: 'clarification', result, tokenUsage: result.tokenUsage || {} };
        }
        const content = {
            action: form ? 'edit_form' : 'create_form',
            formId: form?.id || null,
            schema: result.schema,
            patches: result.patches || [],
            requirements: result.requirements || [],
            verification: result.verification || null,
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

const designWorkflow = async ({ run, message, workflow, form, formArtifactId = null }) => {
    const step = await createStep(run, { stepKey: 'design_workflow', type: 'design_workflow' });
    await startStep(step);
    try {
        const classification = await classifyRequest({ message, snapshot: compactWorkflowSnapshot(workflow) });
        if (classification.action === 'edit_workflow' && workflow) {
            const selected = [...(classification.selectedNodeKeys || [])];
            const affected = (workflow.nodes || [])
                .filter(node => classification.affectedNodeIds.includes(node.id))
                .map(node => `${node.type}:${node.subType}`);
            const specs = NodeRegistry.getSchemasFor([...selected, ...affected]);
            const patched = await patchWorkflow({ message, currentWorkflow: workflow.toJSON(), classification, specs });
            const content = {
                action: 'edit_workflow',
                workflowId: workflow.id,
                nodes: patched.nodes,
                edges: patched.edges,
                diff: patched.diff,
                baseWorkflowUpdatedAt: workflow.updatedAt,
                formArtifactId
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
        const assembled = await assembleWorkflow({
            message,
            specs,
            workflowName: classification.workflowName,
            formId: form?.id || null
        });
        const content = {
            action: 'create_workflow',
            name: assembled.name,
            intent: classification.intent,
            needsForm: classification.needsForm,
            formId: form?.id || null,
            formArtifactId,
            nodes: assembled.nodes,
            edges: assembled.edges,
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

export const processAgenticTurn = async ({ session, userId, message, context = {}, run: existingRun = null, force = false, skipPlanReview = false }) => {
    if (!force && !shouldUseAgenticPath(message)) return { handled: false };

    const persistedContext = {
        surface: context.surface || 'chat',
        formId: context.formId || null,
        workflowId: context.workflowId || null,
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
        await updateRun(run, { status: 'understanding', currentStep: 'understand' });
        const intentStep = await createStep(run, { stepKey: 'understand', type: 'understand' });
        await startStep(intentStep);
        const analyzed = await analyzeIntent({ message, context });
        totalUsage = addUsage(totalUsage, analyzed.tokenUsage);
        await updateRun(run, { intent: analyzed.intent, tokenUsage: totalUsage });
        await completeStep(intentStep, { result: analyzed.intent, tokenUsage: analyzed.tokenUsage });

        await updateRun(run, { status: 'researching', currentStep: 'research' });
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

        const { plan, tokenUsage: planUsage } = await planSolution({
            intent: analyzed.intent,
            resources: researched.resources,
            clarificationMode: persistedContext.clarificationMode
        });
        totalUsage = addUsage(totalUsage, planUsage);
        await updateRun(run, { status: 'planning', plan, tokenUsage: totalUsage });
        const planStep = await createStep(run, { stepKey: 'plan', type: 'plan' });
        await startStep(planStep);
        await completeStep(planStep, { result: plan, tokenUsage: planUsage });

        if (!skipPlanReview && shouldPauseForPlanReview(message)) {
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
        const form = resourceByType(researched.resources, 'form');
        const workflow = resourceByType(researched.resources, 'workflow');
        let formResult = null;
        let workflowResult = null;
        if (analyzed.intent.domains.includes('form')) {
            formResult = await designForm({
                run,
                session,
                message,
                form,
                clarificationMode: persistedContext.clarificationMode
            });
            totalUsage = addUsage(totalUsage, formResult.tokenUsage);
            if (formResult.status === 'clarification') {
                await updateRun(run, { status: 'awaiting_clarification', tokenUsage: totalUsage });
                await session.update({ agentState: { status: 'awaiting_agent_clarification', runId: run.id } });
                const reply = await saveReply(session, { text: formResult.result.message, kind: 'clarification', payload: { runId: run.id, options: formResult.result.inputs || formResult.result.options || [] }, tokenUsage: totalUsage });
                return { handled: true, replyObj: reply, totalTokenUsage: totalUsage };
            }
        }

        if (analyzed.intent.domains.includes('workflow') && (!formResult?.artifact || form)) {
            workflowResult = await designWorkflow({ run, message, workflow, form, formArtifactId: formResult?.artifact?.id || null });
            totalUsage = addUsage(totalUsage, workflowResult.tokenUsage);
        }

        const artifactIds = [formResult?.artifact?.id, workflowResult?.artifact?.id].filter(Boolean);
        if (artifactIds.length === 0) {
            await updateRun(run, { status: 'completed', currentStep: null, tokenUsage: totalUsage });
            const reply = await saveReply(session, { text: 'I understood the request, but it does not yet contain enough detail to design a form or workflow.', kind: 'clarification', payload: { runId: run.id, intent: analyzed.intent, plan } });
            return { handled: true, replyObj: reply, totalTokenUsage: totalUsage };
        }

        await updateRun(run, { status: 'verifying', currentStep: 'verify', tokenUsage: totalUsage });
        const verifyStep = await createStep(run, { stepKey: 'verify', type: 'verify', inputArtifactIds: artifactIds });
        await startStep(verifyStep);
        const artifacts = getRunArtifacts(run);
        const verificationIssues = artifacts.flatMap(artifact => {
            if (artifact.type === 'form_proposal' && !artifact.content?.schema) return [{ code: 'FORM_SCHEMA_MISSING', message: 'The form proposal has no schema.' }];
            if (artifact.type === 'workflow_proposal' && (!Array.isArray(artifact.content?.nodes) || !Array.isArray(artifact.content?.edges))) return [{ code: 'WORKFLOW_DEFINITION_MISSING', message: 'The workflow proposal is incomplete.' }];
            return [];
        });
        if (verificationIssues.length > 0) {
            const error = new Error('The generated solution failed verification.');
            error.code = 'AGENT_VERIFICATION_FAILED';
            error.issues = verificationIssues;
            throw error;
        }
        await completeStep(verifyStep, { result: { status: 'pass', artifactIds } });

        await updateRun(run, { status: 'awaiting_approval', currentStep: null, tokenUsage: totalUsage });
        await session.update({ agentState: { status: 'awaiting_agent_approval', runId: run.id } });
        const firstArtifact = formResult?.artifact || workflowResult?.artifact;
        const kind = firstArtifact.type === 'form_proposal' ? 'form_proposal' : 'workflow_proposal';
        const content = firstArtifact.content;
        const payload = {
            ...content,
            runId: run.id,
            plan,
            artifactIds,
            solution: artifacts.map(artifact => ({ id: artifact.id, type: artifact.type, content: artifact.content }))
        };
        const reply = await saveReply(session, {
            text: plan.summary || 'I prepared a solution for your review.',
            kind,
            payload,
            tokenUsage: totalUsage,
            proposalStatus: 'pending'
        });
        await updateRun(run, { metadata: { ...(run.metadata || {}), proposalMessageId: reply.id } });
        return { handled: true, replyObj: reply, totalTokenUsage: totalUsage };
    } catch (error) {
        const failure = makeError(error);
        await updateRun(run, { status: 'failed', error: failure, currentStep: null, tokenUsage: totalUsage });
        const reply = await saveReply(session, { text: failure.message, kind: 'error', payload: { runId: run.id, code: failure.code, issues: failure.issues }, tokenUsage: totalUsage });
        return { handled: true, replyObj: reply, totalTokenUsage: totalUsage };
    }
};

export const resumeAgentAfterForm = async ({ run, session, userId, formId }) => {
    const metadata = run.metadata || {};
    const request = metadata.request;
    const context = metadata.context || {};
    const form = await Form.findOne({ where: { id: formId, userId } });
    if (!form) throw new Error('The approved form could not be found.');
    const existingWorkflow = context.workflowId ? await Workflow.findOne({ where: { id: context.workflowId, userId } }) : null;
    const result = await designWorkflow({ run, message: request, workflow: existingWorkflow, form, formArtifactId: null });
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

export const resumeAgentAfterClarification = async ({ run, session, userId, context = null }) => {
    const metadata = run.metadata || {};
    const request = metadata.request;
    if (!request) throw new Error('The pending agent request is no longer available.');

    return processAgenticTurn({
        run,
        session,
        userId,
        message: request,
        context: context || metadata.context || {},
        force: true
    });
};

export const resumeAgentAfterPlanReview = async ({ run, session, userId }) => {
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
        skipPlanReview: true
    });
};

export { saveReply as saveAgentReply, messagePayload as agentMessagePayload };
