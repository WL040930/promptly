import crypto from 'crypto';
import { Op } from 'sequelize';
import sequelize from '../../../db/index.js';
import { AssistantMessage, AssistantThread, Form, Workflow, AutomationRun } from '../../../models/index.js';
import { assistantMessageToJSON, createAssistantStateView, ensureAssistantThread } from '../../assistant/assistantStore.js';
import { saveAutomationDraft } from '../../automations/automationService.js';
import { runWorkflowTurn } from '../workflowAIService.js';
import { normalizeWorkflowCommand, resolveWorkflowTurnContext } from './domain/workflowTurnContext.js';
import { buildResourceIdentity, resourceContextForPrompt } from '../../assistant/resourceContext.js';
import { buildWorkflowPresentation } from '../../assistant/proposalPresentation.js';
import { buildAssistantRecovery } from '../../../../shared/assistantRecovery.js';
import { supersedePendingWorkflowProposals } from '../../proposalLifecycle.js';
import { projectFormResourceSummary } from '../form/context/formResourceContext.js';
import googleSpreadsheetService from '../../nodes/googleSpreadsheetService.js';
import { advanceAssistantWork, createAssistantWork, finishAssistantWork } from '../../../../shared/assistantWork.js';
import { normalizeClarificationMode } from '../../../../shared/agentContract.js';
import { createWorkflowProposalApplier } from './workflowProposalApplier.js';
import nodeResourceService from '../../nodes/nodeResourceService.js';
import { buildRunDiagnosticReport } from './runDiagnostics.js';
import { isAssistantTurnStale } from '../../assistant/assistantTurnLiveness.js';
import { resolveClarificationSubmission } from '../../../../shared/clarificationContract.js';

const MAX_HISTORY = 100;
const AI_CONTEXT_HISTORY = 30;
export const DEFAULT_PROPOSAL_APPLY_STALE_AFTER_MS = 5 * 60 * 1000;

const makeId = prefix => `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;
const toWorkflowJson = workflow => workflow?.toJSON ? workflow.toJSON() : workflow;
const publicMessage = message => assistantMessageToJSON(message);
const publicState = state => state?.toJSON?.() || null;

const proposalApplyStartedAt = message => message?.payload?.apply?.startedAt || message?.updatedAt || null;

const isProposalApplyStale = (message, { now = Date.now(), staleAfterMs = DEFAULT_PROPOSAL_APPLY_STALE_AFTER_MS } = {}) => {
    if (message?.proposalStatus !== 'applying') return false;
    const startedAt = new Date(proposalApplyStartedAt(message)).getTime();
    return Number.isFinite(startedAt) && now - startedAt >= staleAfterMs;
};

const errorWith = (code, message, status = 400, details = {}) => {
    const error = new Error(message);
    error.code = code;
    error.status = status;
    Object.assign(error, details);
    return error;
};

const progressSnapshot = (progress, now = () => new Date()) => ({
    status: String(progress?.status || 'working').trim() || 'working',
    message: String(progress?.message || 'Working on your workflow…').trim() || 'Working on your workflow…',
    ...(typeof progress?.phase === 'string' ? { phase: progress.phase } : {}),
    ...(typeof progress?.label === 'string' ? { label: progress.label } : {}),
    ...(typeof progress?.detail === 'string' ? { detail: progress.detail } : {}),
    ...(typeof progress?.id === 'string' ? { id: progress.id } : {}),
    ...(typeof progress?.type === 'string' ? { type: progress.type } : {}),
    ...(Number.isInteger(progress?.attempt) ? { attempt: progress.attempt } : {}),
    ...(['reply', 'clarification', 'proposal'].includes(progress?.outcomeKind) ? { outcomeKind: progress.outcomeKind } : {}),
    ...(progress?.artifact && typeof progress.artifact === 'object' ? { artifact: progress.artifact } : {}),
    updatedAt: now().toISOString()
});

const formIdForWorkflowNodes = (nodes = []) => nodes.find(node => node?.subType === 'form-submission')?.config?.formId || null;
const compactOwnedForms = forms => forms.map(projectFormResourceSummary).filter(Boolean);

const statePatchForResult = ({ resultKind, command, proposalMessageId = null, previousActiveProposalMessageId = null, now = () => new Date() }) => {
    const isClarification = resultKind === 'clarification';
    const isProposal = resultKind === 'workflow_proposal';
    const sourceText = command?.type === 'decide_for_me' ? null : String(command?.text || '').trim();
    return {
        phase: isClarification ? 'awaiting_clarification' : (isProposal || previousActiveProposalMessageId ? 'awaiting_proposal' : 'idle'),
        activeProposalMessageId: isProposal ? proposalMessageId : previousActiveProposalMessageId,
        openClarification: null,
        activeWork: isClarification ? { sourceText, updatedAt: now().toISOString() } : null
    };
};

const messageFromResult = ({ result, workflow, idFactory = makeId }) => {
    if (result.kind === 'proposal') {
        const proposal = {
            workflowId: workflow.id,
            baseWorkflowRevision: workflow.revision,
            requirements: result.requirements,
            capabilities: result.capabilities,
            workflowUpdates: result.workflowUpdates || null,
            nodes: result.nodes,
            edges: result.edges,
            operations: result.operations,
            diff: result.diff,
            readiness: result.readiness,
            verification: result.verification,
            warnings: result.warnings || [],
            plan: result.plan || [],
            resourceChanges: result.resourceChanges || [],
            resourceIntent: result.resourceIntent || null,
            contextDelta: result.contextDelta || null,
            diagnosis: result.diagnosis || null
        };
        const presentation = buildWorkflowPresentation({ workflow: toWorkflowJson(workflow), proposal });
        return { text: presentation.outcome, kind: 'workflow_proposal', payload: { ...proposal, presentation } };
    }
    if (result.kind === 'clarification') {
        return {
            text: result.message,
            kind: 'clarification',
            payload: { clarificationId: idFactory('clarification'), inputs: result.inputs || [], allowDecide: true }
        };
    }
    return { text: result.message || result.text || 'I could not find a safe workflow change to make.', kind: 'text', payload: null };
};

export const createWorkflowAssistant = ({
    models = { AssistantMessage, AssistantThread, Form, Workflow, AutomationRun },
    db = sequelize,
    runTurn = runWorkflowTurn,
    saveDraft = saveAutomationDraft,
    spreadsheetService = googleSpreadsheetService,
    now = () => new Date(),
    idFactory = makeId,
    proposalApplyStaleAfterMs = DEFAULT_PROPOSAL_APPLY_STALE_AFTER_MS
} = {}) => {
    const findWorkflow = async (workflowId, userId, options = {}) => {
        const workflow = await models.Workflow.findOne({ where: { id: workflowId, userId }, ...options });
        if (!workflow) throw errorWith('WORKFLOW_NOT_FOUND', 'Workflow not found.', 404);
        return workflow;
    };
    const ensureState = async ({ workflow, transaction }) => createAssistantStateView(await ensureAssistantThread({
        surface: 'workflow', workflowId: workflow.id, userId: workflow.userId, title: workflow.name || 'Workflow AI',
        models: { AssistantThread: models.AssistantThread }, transaction, lock: Boolean(transaction?.LOCK?.UPDATE)
    }));
    const recoverStaleTurn = async ({ state, workflow, transaction }) => {
        if (!isAssistantTurnStale(publicState(state), { now: now().getTime() })) return false;

        const requestId = state.inFlightRequestId;
        const messages = await models.AssistantMessage.findAll({
            where: { threadId: state.threadId, sender: 'bot' },
            order: [['createdAt', 'DESC']],
            transaction
        });
        const workMessage = messages.find(message => message.payload?.work?.requestId === requestId) || null;
        const retryText = workMessage?.payload?.work?.title || '';
        const recovery = buildAssistantRecovery({
            surface: 'workflow',
            code: 'WORKFLOW_AI_TURN_STALLED',
            context: { formId: formIdForWorkflowNodes(workflow.nodes || []), retryText }
        });
        const errorMetadata = { code: 'WORKFLOW_AI_TURN_STALLED', retryable: true, recovery };
        if (workMessage) {
            await workMessage.update({
                text: recovery.summary,
                kind: 'error',
                payload: {
                    ...errorMetadata,
                    work: finishAssistantWork(workMessage.payload?.work, { status: 'failed', detail: recovery.summary }, now())
                },
                isError: true,
                errorMetadata
            }, { transaction });
        }
        await state.update({
            phase: state.activeProposalMessageId ? 'awaiting_proposal' : 'idle',
            activeWork: null,
            openClarification: null,
            inFlightRequestId: null,
            inFlightStartedAt: null,
            inFlightLastActivityAt: null,
            progress: null
        }, { transaction });
        return true;
    };
    const recoverStaleProposal = async ({ state, transaction, proposalMessageId = state.activeProposalMessageId }) => {
        if (!proposalMessageId) return { recovered: false };
        const message = await models.AssistantMessage.findOne({
            where: { id: proposalMessageId, threadId: state.threadId, kind: 'workflow_proposal' },
            transaction,
            ...(transaction?.LOCK?.UPDATE ? { lock: transaction.LOCK.UPDATE } : {})
        });
        if (!isProposalApplyStale(message, { now: now().getTime(), staleAfterMs: proposalApplyStaleAfterMs })) return { recovered: false };

        const payload = message.payload || {};
        const recoveredAt = now().toISOString();
        const recoveredPayload = {
            ...payload,
            apply: {
                ...(payload.apply || {}),
                status: 'recovered',
                recoveredAt,
                detail: 'The previous Apply request stopped before completion. The proposal can be retried safely.'
            }
        };
        await message.update({ proposalStatus: 'pending', payload: recoveredPayload }, { transaction });
        await state.update({
            phase: 'awaiting_proposal',
            activeWork: null,
            openClarification: null
        }, { transaction });
        return { recovered: true, payload: recoveredPayload };
    };
    const attachedForm = async (workflow, userId, transaction, nodes = workflow.nodes || []) => {
        const formId = formIdForWorkflowNodes(nodes);
        return formId ? models.Form.findOne({ where: { id: formId, userId }, transaction }) : null;
    };
    const proposalApplier = createWorkflowProposalApplier({
        db, models: { AssistantMessage: models.AssistantMessage, Form: models.Form }, findWorkflow, ensureState,
        publicMessage, toWorkflowJson, saveDraft, spreadsheetService, now, errorWith
    });

    // Applying a proposal can spend time in an external provider (for
    // example, creating and initialising a Google Sheet). Keep duplicate
    // requests in the same process attached to the original promise so a
    // double-click cannot start a second provisioning attempt.
    const inFlightProposalApplies = new Map();

    const getHistory = async ({ workflowId, userId, limit = 50, before = null }) => {
        const workflow = await findWorkflow(workflowId, userId);
        return db.transaction(async transaction => {
            const state = await ensureState({ workflow, transaction });
            await recoverStaleTurn({ state, workflow, transaction });
            await recoverStaleProposal({ state, transaction });
            const where = { threadId: state.threadId };
            if (before) {
                const cursor = await models.AssistantMessage.findOne({ where: { id: before, threadId: state.threadId }, transaction });
                if (cursor?.createdAt) where.createdAt = { [Op.lt]: cursor.createdAt };
            }
            const pageSize = Math.min(Math.max(Number(limit) || 50, 1), MAX_HISTORY);
            const messages = await models.AssistantMessage.findAll({ where, order: [['createdAt', 'DESC']], limit: pageSize, transaction });
            const nextBefore = messages.length >= pageSize ? messages[messages.length - 1]?.id || null : null;
            return { messages: messages.reverse().map(publicMessage), nextBefore, state: publicState(state) };
        });
    };

    const submitTurn = async ({ workflowId, userId, command, clarificationMode, expectedStateVersion = null, requestId = idFactory('wturn'), onProgress = null } = {}) => {
        const workflow = await findWorkflow(workflowId, userId);
        let normalizedCommand = normalizeWorkflowCommand(command);
        const mode = normalizeClarificationMode(clarificationMode);
        if (normalizedCommand.type === 'submit_text' && !normalizedCommand.text) throw errorWith('WORKFLOW_AI_INPUT_REQUIRED', 'Please describe a workflow change.', 400);
        const displayText = normalizedCommand.type === 'decide_for_me' ? 'Use sensible defaults.' : normalizedCommand.text;
        let reservation;
        let progressChain = Promise.resolve();
        const reportProgress = progress => {
            const snapshot = progressSnapshot(progress, now);
            progressChain = progressChain.then(() => db.transaction(async transaction => {
                const state = await ensureState({ workflow, transaction });
                if (state.inFlightRequestId !== requestId) return null;
                const workMessage = await models.AssistantMessage.findOne({ where: { id: reservation.workMessage.id, threadId: state.threadId }, transaction });
                const work = advanceAssistantWork(workMessage?.payload?.work, snapshot, now());
                if (workMessage) await workMessage.update({ payload: { ...(workMessage.payload || {}), work } }, { transaction });
                await state.update({ phase: 'processing', progress: snapshot, inFlightLastActivityAt: now() }, { transaction });
                return { ...snapshot, work, messageId: workMessage?.id || null };
            }));
            void progressChain.then(event => onProgress?.(event)).catch(() => {});
        };

        try {
            await db.transaction(async transaction => {
                const state = await ensureState({ workflow, transaction });
                await recoverStaleTurn({ state, workflow, transaction });
                if (Number.isInteger(expectedStateVersion) && expectedStateVersion !== state.version) throw errorWith('WORKFLOW_AI_STATE_CONFLICT', 'This workflow assistant changed in another tab. Refresh the conversation and try again.', 409, { currentStateVersion: state.version });
                if (state.inFlightRequestId && state.inFlightRequestId !== requestId) throw errorWith('WORKFLOW_AI_TURN_IN_PROGRESS', 'This workflow assistant is already processing a request.', 409, { currentStateVersion: state.version });
                if (!state.inFlightRequestId && state.phase === 'processing') throw errorWith('WORKFLOW_AI_TURN_IN_PROGRESS', 'This workflow assistant is already processing a request.', 409, { currentStateVersion: state.version });
                const pending = state.activeProposalMessageId ? await models.AssistantMessage.findOne({ where: { id: state.activeProposalMessageId, threadId: state.threadId }, transaction }) : null;
                let clarificationResolution = null;
                if (state.openClarification && normalizedCommand.type === 'submit_clarification') {
                    clarificationResolution = resolveClarificationSubmission({
                        inputs: state.openClarification.inputs || [],
                        state: normalizedCommand.state || {}
                    });
                    if (!clarificationResolution.complete) {
                        throw errorWith(
                            'WORKFLOW_AI_CLARIFICATION_INCOMPLETE',
                            'Please complete the requested information before continuing.',
                            400,
                            {
                                missingInputIds: clarificationResolution.missingInputIds,
                                missingGroups: clarificationResolution.missingGroups,
                                conflictingGroups: clarificationResolution.conflictingGroups,
                                invalidInputIds: clarificationResolution.invalidInputIds
                            }
                        );
                    }
                    normalizedCommand = { ...normalizedCommand, state: clarificationResolution.state };
                }
                if (state.openClarification && ['submit_clarification', 'decide_for_me'].includes(normalizedCommand.type)) {
                    const clarification = await models.AssistantMessage.findOne({ where: { threadId: state.threadId, sender: 'bot', kind: 'clarification' }, order: [['createdAt', 'DESC']], transaction });
                    if (clarification) await clarification.update({ payload: {
                        ...(clarification.payload || {}),
                        ...(normalizedCommand.type === 'submit_clarification' ? { selectedState: normalizedCommand.state || {} } : {}),
                        resolution: {
                            type: normalizedCommand.type === 'decide_for_me' ? 'defaulted' : 'answered',
                            answeredAt: now().toISOString(),
                            ...(clarificationResolution?.answers ? { answers: clarificationResolution.answers } : {})
                        }
                    } }, { transaction });
                } else if (state.openClarification && normalizedCommand.type === 'submit_text') {
                    const clarification = await models.AssistantMessage.findOne({ where: { threadId: state.threadId, sender: 'bot', kind: 'clarification' }, order: [['createdAt', 'DESC']], transaction });
                    if (clarification) await clarification.update({ payload: {
                        ...(clarification.payload || {}),
                        resolution: { type: 'superseded', answeredAt: now().toISOString() }
                    } }, { transaction });
                }
                const context = resolveWorkflowTurnContext({ command: normalizedCommand, activeWork: state.activeWork, clarification: state.openClarification, pendingProposal: pending ? publicMessage(pending) : null, clarificationMode: mode });
                const userMessage = await models.AssistantMessage.create({ id: idFactory('wmsg'), threadId: state.threadId, sender: 'user', text: displayText, kind: 'text' }, { transaction });
                const workMessage = await models.AssistantMessage.create({ id: idFactory('wmsg'), threadId: state.threadId, sender: 'bot', text: 'Drafting your workflow', kind: 'assistant_work', payload: { work: createAssistantWork({ requestId, surface: 'workflow', title: displayText, now: now() }) } }, { transaction });
                const startedAt = now();
                await state.update({ version: state.version + 1, phase: 'processing', mode, inFlightRequestId: requestId, inFlightStartedAt: startedAt, inFlightLastActivityAt: startedAt, progress: progressSnapshot({ status: 'starting', message: 'Preparing workflow changes…' }, now), openClarification: null }, { transaction });
                reservation = { state, pending, context, userMessage, workMessage };
            });

            reportProgress({
                id: 'turn:started',
                status: 'starting',
                phase: 'understand',
                label: 'Preparing the workflow request',
                message: 'Preparing workflow changes',
                detail: 'Saved your request and loading the current workflow context.'
            });
            await progressChain;
            const rawHistory = await models.AssistantMessage.findAll({ where: { threadId: reservation.state.threadId }, order: [['createdAt', 'DESC']], limit: AI_CONTEXT_HISTORY + 2 });
            const history = rawHistory.reverse().filter(message => ![reservation.userMessage.id, reservation.workMessage.id].includes(message.id)).map(publicMessage);
        const form = await attachedForm(workflow, userId);
            const ownedForms = await models.Form.findAll({ where: { userId }, attributes: ['id', 'title', 'updatedAt'], order: [['updatedAt', 'DESC']] });
            const loadRunDiagnostic = async ({ selector, runId }) => {
                if (!models.AutomationRun) return null;
                const where = { userId, workflowId };
                if (selector === 'referenced') where.id = runId;
                if (selector === 'latest_failed') where.status = 'failed';
                const run = await models.AutomationRun.findOne({ where, order: [['createdAt', 'DESC']] });
                if (!run) return null;
                return buildRunDiagnosticReport({
                    run: run.toJSON?.() || run,
                    workflow: toWorkflowJson(workflow),
                    rangeLoader: ({ spreadsheetId }) => nodeResourceService.list({ userId, resource: 'google-sheet-ranges', params: { spreadsheetId } })
                });
            };
            const request = reservation.context.command.type === 'decide_for_me' ? `Resolve the active workflow request using sensible defaults. Active request: ${reservation.context.intent.sourceText || 'the current workflow request'}` : reservation.context.command.text;
            const result = await runTurn({
                request, currentWorkflow: toWorkflowJson(workflow), history,
                pendingProposal: reservation.pending && reservation.context.pendingProposal.mode === 'include' ? publicMessage(reservation.pending) : null,
                clarificationMode: mode, turnContext: reservation.context, userId, userContext: { forms: compactOwnedForms(ownedForms) },
                assistantContext: resourceContextForPrompt({ identity: buildResourceIdentity({ surface: 'workflow', resource: toWorkflowJson(workflow) }), context: reservation.state.context }),
                formSchema: form?.toJSON?.() || null,
                formLoader: async ({ formId }) => (await models.Form.findOne({ where: { id: formId, userId } }))?.toJSON?.() || null,
                runLoader: loadRunDiagnostic,
                onProgress: reportProgress
            });
            await progressChain;
            const reply = messageFromResult({ result, workflow, idFactory });
            return db.transaction(async transaction => {
                const state = await ensureState({ workflow, transaction });
                if (state.inFlightRequestId !== requestId) {
                    return { userMsg: publicMessage(reservation.userMessage), botMsg: null, state: publicState(state), superseded: true };
                }
                const supersededMessageIds = reply.kind === 'workflow_proposal' ? await supersedePendingWorkflowProposals({ threadId: state.threadId, transaction, messageModel: models.AssistantMessage }) : [];
                const botMessage = await models.AssistantMessage.findOne({ where: { id: reservation.workMessage.id, threadId: state.threadId }, transaction });
                const work = finishAssistantWork(botMessage?.payload?.work, { status: reply.kind === 'workflow_proposal' ? 'awaiting_review' : reply.kind === 'clarification' ? 'needs_input' : 'completed', detail: reply.text }, now());
                await botMessage.update({ text: reply.text, kind: reply.kind, payload: { ...(reply.payload || {}), work }, tokenUsage: result.tokenUsage || null, proposalStatus: reply.kind === 'workflow_proposal' ? 'pending' : null }, { transaction });
                const statePatch = statePatchForResult({ resultKind: reply.kind, command: reservation.context.command, proposalMessageId: botMessage.id, previousActiveProposalMessageId: state.activeProposalMessageId, now });
                if (reply.kind === 'clarification') {
                    statePatch.openClarification = reply.payload;
                    statePatch.activeWork = { ...statePatch.activeWork, sourceText: reservation.context.intent.sourceText || request, requestId, relationToPending: reservation.context.intent.relationToPending };
                }
                await state.update({ ...statePatch, version: state.version + 1, inFlightRequestId: null, inFlightStartedAt: null, inFlightLastActivityAt: null, progress: null }, { transaction });
                return { userMsg: publicMessage(reservation.userMessage), botMsg: { ...publicMessage(botMessage), supersededMessageIds }, state: publicState(state) };
            });
        } catch (error) {
            if (!reservation) throw error;
            await progressChain.catch(() => {});
            const formId = formIdForWorkflowNodes(workflow.nodes || []);
            const recovery = buildAssistantRecovery({ surface: 'workflow', code: error.code || 'WORKFLOW_AI_FAILED', issues: error.issues || [], context: { formId, retryText: displayText } });
            return db.transaction(async transaction => {
                const state = await ensureState({ workflow, transaction });
                if (state.inFlightRequestId !== requestId) {
                    return { userMsg: publicMessage(reservation.userMessage), botMsg: null, state: publicState(state), superseded: true };
                }
                const botMessage = await models.AssistantMessage.findOne({ where: { id: reservation.workMessage.id, threadId: state.threadId }, transaction });
                const errorMetadata = { code: error.code || 'WORKFLOW_AI_FAILED', retryable: recovery.retryable, recovery };
                await botMessage.update({ text: recovery.summary, kind: 'error', payload: { ...errorMetadata, work: finishAssistantWork(botMessage?.payload?.work, { status: 'failed', detail: recovery.summary }, now()) }, isError: true, errorMetadata }, { transaction });
                await state.update({ version: state.version + 1, phase: state.activeProposalMessageId ? 'awaiting_proposal' : 'idle', activeWork: null, openClarification: null, inFlightRequestId: null, inFlightStartedAt: null, inFlightLastActivityAt: null, progress: null }, { transaction });
                return { userMsg: publicMessage(reservation.userMessage), botMsg: publicMessage(botMessage), state: publicState(state), error: { code: errorMetadata.code, message: recovery.summary } };
            });
        }
    };

    const clearChat = async ({ workflowId, userId }) => db.transaction(async transaction => {
        const workflow = await findWorkflow(workflowId, userId, { transaction, lock: transaction.LOCK.UPDATE });
        const state = await ensureState({ workflow, transaction });
        if (state.inFlightRequestId) throw errorWith('WORKFLOW_AI_TURN_IN_PROGRESS', 'The workflow AI is still processing a request. Wait for it to finish before clearing the chat.', 409);
        const deletedMessages = await models.AssistantMessage.destroy({ where: { threadId: state.threadId }, transaction });
        await state.update({ version: state.version + 1, phase: 'idle', activeWork: null, openClarification: null, activeProposalMessageId: null, inFlightRequestId: null, inFlightStartedAt: null, inFlightLastActivityAt: null, progress: null }, { transaction });
        return { cleared: true, deletedMessages, state: publicState(state) };
    });

    const resetContext = async ({ workflowId, userId }) => db.transaction(async transaction => {
        const workflow = await findWorkflow(workflowId, userId, { transaction, lock: transaction.LOCK.UPDATE });
        const state = await ensureState({ workflow, transaction });
        if (state.inFlightRequestId) throw errorWith('WORKFLOW_AI_TURN_IN_PROGRESS', 'The workflow AI is still processing a request.', 409);
        const { resourceBrief, ...context } = state.context || {};
        await state.updateContext(context, { transaction });
        await state.update({ version: state.version + 1 }, { transaction });
        return { reset: true, state: publicState(state) };
    });

    const decideProposal = async ({ workflowId, userId, proposalMessageId, action = 'accept', expectedStateVersion = null }) => {
        const workflow = await findWorkflow(workflowId, userId);
        const message = await models.AssistantMessage.findOne({ where: { id: proposalMessageId, kind: 'workflow_proposal' }, include: [{ model: models.AssistantThread, as: 'thread', where: { surface: 'workflow', workflowId, userId } }] });
        if (!message) throw errorWith('WORKFLOW_PROPOSAL_NOT_FOUND', 'Workflow proposal not found.', 404);
        const payload = message.payload || {};
        if (action === 'reject') {
            if (message.proposalStatus !== 'pending') {
                throw errorWith(
                    message.proposalStatus === 'applying' ? 'WORKFLOW_PROPOSAL_APPLYING' : 'WORKFLOW_PROPOSAL_NOT_PENDING',
                    message.proposalStatus === 'applying'
                        ? 'This workflow proposal is already being applied. Wait for the current Apply request to finish.'
                        : 'This workflow proposal is no longer pending.',
                    409
                );
            }
            return db.transaction(async transaction => {
                const state = await ensureState({ workflow, transaction });
                if (Number.isInteger(expectedStateVersion) && expectedStateVersion !== state.version) throw errorWith('WORKFLOW_AI_STATE_CONFLICT', 'The workflow assistant changed in another tab. Refresh the conversation and try again.', 409, { currentStateVersion: state.version });
                await message.update({ proposalStatus: 'rejected', payload: { ...payload, work: finishAssistantWork(payload.work, { status: 'ignored', detail: 'Proposal ignored' }, now()) } }, { transaction });
                await state.update({ version: state.version + 1, phase: state.activeProposalMessageId === message.id ? 'idle' : state.phase, activeProposalMessageId: state.activeProposalMessageId === message.id ? null : state.activeProposalMessageId }, { transaction });
                return { message: publicMessage(message), state: publicState(state) };
            });
        }

        const applyKey = `${userId}:${workflowId}:${proposalMessageId}`;
        const inFlight = inFlightProposalApplies.get(applyKey);
        if (inFlight) return inFlight;
        if (message.proposalStatus === 'applying') {
            const recovery = await db.transaction(async transaction => {
                const state = await ensureState({ workflow, transaction });
                return recoverStaleProposal({ state, transaction, proposalMessageId });
            });
            if (recovery.recovered) {
                message.proposalStatus = 'pending';
                message.payload = recovery.payload;
            }
        }
        if (message.proposalStatus !== 'pending') {
            throw errorWith(
                message.proposalStatus === 'applying' ? 'WORKFLOW_PROPOSAL_APPLYING' : 'WORKFLOW_PROPOSAL_NOT_PENDING',
                message.proposalStatus === 'applying'
                    ? 'This workflow proposal is already being applied. Wait for the current Apply request to finish.'
                    : 'This workflow proposal is no longer pending.',
                409
            );
        }

        const applyPromise = proposalApplier.apply({ workflowId, userId, proposalMessageId, expectedStateVersion, workflow, message, payload });
        inFlightProposalApplies.set(applyKey, applyPromise);
        try {
            return await applyPromise;
        } finally {
            if (inFlightProposalApplies.get(applyKey) === applyPromise) inFlightProposalApplies.delete(applyKey);
        }
    };

    return { getHistory, submitTurn, clearChat, resetContext, decideProposal };
};

export const workflowAssistant = createWorkflowAssistant();

export const workflowAssistantInternals = { publicMessage, publicState, statePatchForResult, formIdForWorkflowNodes, normalizeWorkflowCommand, resolveWorkflowTurnContext };
