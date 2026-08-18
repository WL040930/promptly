import crypto from 'crypto';
import { Op } from 'sequelize';
import sequelize from '../../../db/index.js';
import { AssistantMessage, AssistantThread, Form, Workflow, WorkflowVersion } from '../../../models/index.js';
import { createAssistantStateView, ensureAssistantThread } from '../../assistant/assistantStore.js';
import { runFormTurn } from '../formAIService.js';
import { FORM_AI_HISTORY_LIMIT, validateQuestionCardinality } from './context/formContext.js';
import { applyFormPatches } from './domain/formPatchEngine.js';
import { normalizeClarificationMode } from '../../../../shared/agentContract.js';
import { buildAssistantRecovery } from '../../../../shared/assistantRecovery.js';
import { resolveFormTurnContext, detectFormIntentScope } from './domain/formTurnContext.js';
import { supersedePendingFormChatProposals } from '../../proposalLifecycle.js';
import { applyResourceContextDelta, buildResourceIdentity, resourceContextForPrompt } from '../../assistant/resourceContext.js';
import { buildFormPresentation } from '../../assistant/proposalPresentation.js';
import { advanceAssistantWork, createAssistantWork, finishAssistantWork } from '../../../../shared/assistantWork.js';
import { isAssistantTurnStale } from '../../assistant/assistantTurnLiveness.js';
import { resolveClarificationSubmission } from '../../../../shared/clarificationContract.js';
import { outcomeForAssistantMessage } from '../../../../shared/assistantTurnNotification.js';
import { applyFormChange } from '../../forms/formWorkflowDependencyService.js';

const MAX_HISTORY = 100;

const makeId = prefix => `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;

const asJson = value => (value && typeof value.toJSON === 'function' ? value.toJSON() : value);

const progressSnapshot = (progress, now = () => new Date()) => ({
    status: String(progress?.status || 'working').trim() || 'working',
    message: String(progress?.message || 'Working on your form…').trim() || 'Working on your form…',
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

const toCommand = ({ command } = {}) => {
    if (command && typeof command === 'object' && command.type === 'decide_for_me') {
        return { type: 'decide_for_me', clarificationId: command.clarificationId || null };
    }
    if (command && typeof command === 'object' && command.type === 'submit_clarification') {
        return { type: 'submit_clarification', text: String(command.text || '').trim(), state: command.state };
    }
    if (command && typeof command === 'object' && command.type === 'submit_text') {
        return { type: 'submit_text', text: String(command.text || '').trim() };
    }
    return { type: 'submit_text', text: '' };
};

const publicMessage = message => {
    const value = asJson(message);
    if (!value) return null;
    return {
        id: value.id,
        sender: value.sender,
        text: value.text,
        createdAt: value.createdAt,
        kind: value.kind || 'text',
        payload: value.payload || null,
        proposalStatus: value.proposalStatus || null,
        tokenUsage: value.tokenUsage || null,
        errorMetadata: value.errorMetadata || null,
        isError: value.isError === true
    };
};

const messageFromResult = (result, form = {}) => {
    const text = result?.message || result?.text || 'I could not find a safe change to make.';
    if (result?.kind === 'proposal') {
        const proposal = {
            schema: result.schema,
            patches: result.patches,
            requirements: result.requirements,
            verification: result.verification,
            warnings: result.warnings || [],
            cardinality: result.cardinality,
            contextDelta: result.contextDelta || null,
            revisesProposalMessageId: result.revisesProposalMessageId || null,
            baseFormUpdatedAt: result.baseFormUpdatedAt
        };
        const presentation = buildFormPresentation({ form, proposal });
        return { text: presentation.outcome, proposal: { ...proposal, presentation } };
    }

    if (result?.kind === 'clarification') {
        return {
            text,
            options: {
                clarificationId: makeId('clarification'),
                inputs: result.inputs || [],
                allowDecide: true
            }
        };
    }

    return { text };
};

const statePatchForResult = ({ result, command, proposalMessageId = null, previousActiveProposalMessageId = null }) => {
    const isClarification = result?.kind === 'clarification';
    const isProposal = result?.kind === 'proposal';
    const sourceText = command.type === 'decide_for_me'
        ? null
        : (typeof command.text === 'string' ? command.text.trim() : null);

    return {
        phase: isClarification ? 'awaiting_clarification' : (isProposal || previousActiveProposalMessageId ? 'awaiting_proposal' : 'idle'),
        openClarification: isClarification ? { message: result.message, inputs: result.inputs || [] } : null,
        activeProposalMessageId: isProposal ? proposalMessageId : previousActiveProposalMessageId,
        activeWork: isClarification
            ? { id: makeId('work'), sourceText, scope: detectFormIntentScope(sourceText), updatedAt: new Date().toISOString() }
            : null,
    };
};

export const createFormAssistant = ({
    models = { Form, AssistantThread, AssistantMessage, Workflow, WorkflowVersion },
    db = sequelize,
    runTurn = runFormTurn,
    now = () => new Date(),
    idFactory = makeId
} = {}) => {
    const loadState = async (formId, transaction, userId) => {
        const thread = await ensureAssistantThread({
            surface: 'form',
            formId,
            userId,
            title: 'Form AI',
            models: { AssistantThread: models.AssistantThread },
            transaction
        });
        return createAssistantStateView(thread);
    };

    const recoverStaleTurn = async ({ state, formId, transaction }) => {
        if (!isAssistantTurnStale(state.toJSON(), { now: now().getTime() })) return false;

        const requestId = state.inFlightRequestId;
        const messages = await models.AssistantMessage.findAll({
            where: { threadId: state.threadId, sender: 'bot' },
            order: [['createdAt', 'DESC']],
            transaction
        });
        const workMessage = messages.find(message => message.payload?.work?.requestId === requestId) || null;
        const recovery = buildAssistantRecovery({
            surface: 'form',
            code: 'FORM_AI_TURN_STALLED',
            context: { formId, retryText: workMessage?.payload?.work?.title || '' }
        });
        const errorMetadata = { code: 'FORM_AI_TURN_STALLED', retryable: true, recovery };

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
            progress: null,
            lastTurn: {
                requestId,
                status: 'failed',
                outcome: 'error',
                messageId: workMessage?.id || null,
                completedAt: now().toISOString()
            }
        }, { transaction });
        return true;
    };

    const submitTurn = async ({
        userId,
        formId,
        command: rawCommand,
        clarificationMode,
        expectedStateVersion = null,
        requestId = idFactory('request'),
        provider = null,
        onProgress = null
    } = {}) => {
        let command = toCommand({ command: rawCommand });
        const mode = normalizeClarificationMode(clarificationMode);
        if (command.type === 'submit_text' && !command.text) {
            const error = new Error('Prompt is required');
            error.status = 400;
            error.code = 'FORM_AI_EMPTY_PROMPT';
            throw error;
        }
        let reservation;

        await db.transaction(async transaction => {
            const form = await models.Form.findOne({ where: { id: formId, userId }, transaction });
            if (!form) {
                const error = new Error('Form not found');
                error.status = 404;
                throw error;
            }

            const state = await loadState(formId, transaction, userId);
            await recoverStaleTurn({ state, formId, transaction });
            if (Number.isInteger(expectedStateVersion) && state.version !== expectedStateVersion) {
                const error = new Error('The form AI conversation changed. Refresh and try again.');
                error.code = 'FORM_AI_STATE_CONFLICT';
                error.status = 409;
                error.currentStateVersion = state.version;
                throw error;
            }
            if (state.inFlightRequestId && state.inFlightRequestId !== requestId) {
                const error = new Error('Another form AI request is already being processed.');
                error.code = 'FORM_AI_TURN_IN_PROGRESS';
                error.status = 409;
                throw error;
            }

            const pending = state.activeProposalMessageId
                ? await models.AssistantMessage.findOne({ where: { id: state.activeProposalMessageId, threadId: state.threadId }, transaction })
                : null;

            let clarificationResolution = null;
            if (state.openClarification && command.type === 'submit_clarification') {
                clarificationResolution = resolveClarificationSubmission({
                    inputs: state.openClarification.inputs || [],
                    state: command.state || {}
                });
                if (!clarificationResolution.complete) {
                    const error = new Error('Please complete the requested information before continuing.');
                    error.code = 'FORM_AI_CLARIFICATION_INCOMPLETE';
                    error.status = 400;
                    error.missingInputIds = clarificationResolution.missingInputIds;
                    error.missingGroups = clarificationResolution.missingGroups;
                    error.conflictingGroups = clarificationResolution.conflictingGroups;
                    error.invalidInputIds = clarificationResolution.invalidInputIds;
                    throw error;
                }
                command = { ...command, state: clarificationResolution.state };
            }
            if (state.openClarification && ['submit_clarification', 'decide_for_me'].includes(command.type)) {
                const clarificationMessage = await models.AssistantMessage.findOne({
                    where: { threadId: state.threadId, sender: 'bot', kind: 'clarification' },
                    order: [['createdAt', 'DESC']],
                    transaction
                });
                if (clarificationMessage) {
                    await clarificationMessage.update({
                        payload: {
                            ...clarificationMessage.payload,
                            ...(command.type === 'submit_clarification' ? { selectedState: command.state || {} } : {}),
                            resolution: {
                                type: command.type === 'decide_for_me' ? 'defaulted' : 'answered',
                                answeredAt: new Date().toISOString(),
                                ...(clarificationResolution?.answers ? { answers: clarificationResolution.answers } : {})
                            }
                        }
                    }, { transaction });
                }
            } else if (state.openClarification && command.type === 'submit_text') {
                const clarificationMessage = await models.AssistantMessage.findOne({
                    where: { threadId: state.threadId, sender: 'bot', kind: 'clarification' },
                    order: [['createdAt', 'DESC']],
                    transaction
                });
                if (clarificationMessage) await clarificationMessage.update({ payload: {
                    ...clarificationMessage.payload,
                    resolution: { type: 'superseded', answeredAt: new Date().toISOString() }
                } }, { transaction });
            }

            const context = resolveFormTurnContext({
                command,
                clarification: state.openClarification
                    ? { ...state.openClarification, id: state.openClarification.id || 'active' }
                    : null,
                activeWork: state.activeWork,
                pendingProposal: asJson(pending)?.payload || null,
                clarificationMode: mode
            });
            const userMessage = await models.AssistantMessage.create({
                id: idFactory('fmsg'),
                threadId: state.threadId,
                sender: 'user',
                text: command.type === 'decide_for_me' ? 'Use sensible defaults.' : command.text
            }, { transaction });
            const workMessage = await models.AssistantMessage.create({
                id: idFactory('fmsg'), threadId: state.threadId, sender: 'bot', text: 'Drafting your form', kind: 'assistant_work',
                payload: { work: createAssistantWork({
                    requestId, surface: 'form',
                    title: command.type === 'decide_for_me' ? 'Using sensible defaults' : command.text,
                    now: now()
                }) }
            }, { transaction });

            const startedAt = now();
            await state.update({
                version: state.version + 1,
                phase: 'processing',
                mode,
                inFlightRequestId: requestId,
                inFlightStartedAt: startedAt,
                inFlightLastActivityAt: startedAt,
                progress: progressSnapshot({ status: 'starting', message: 'Preparing form changes…' }, now)
            }, { transaction });

            reservation = { form, state, pending, context, userMessage, workMessage, resourceContext: resourceContextForPrompt({
                identity: buildResourceIdentity({ surface: 'form', resource: asJson(form) }),
                context: state.context
            }) };
        });

        const { form, state, pending, context, userMessage, resourceContext } = reservation;
        let progressChain = Promise.resolve();
        const reportProgress = progress => {
            const snapshot = progressSnapshot(progress, now);
            progressChain = progressChain.then(() => db.transaction(async transaction => {
                const freshState = await loadState(formId, transaction, userId);
                if (freshState.inFlightRequestId !== requestId) return;
                const workMessage = await models.AssistantMessage.findOne({ where: { id: reservation.workMessage.id, threadId: freshState.threadId }, transaction });
                const work = advanceAssistantWork(workMessage?.payload?.work, snapshot, now());
                if (workMessage) await workMessage.update({ payload: { ...(workMessage.payload || {}), work } }, { transaction });
                await freshState.update({ phase: 'processing', progress: snapshot, inFlightLastActivityAt: now() }, { transaction });
                return { ...snapshot, work, messageId: workMessage?.id || null };
            }));
            void progressChain.then(event => onProgress?.(event)).catch(() => {});
        };
        try {
            reportProgress({
                id: 'turn:started',
                status: 'starting',
                phase: 'understand',
                label: 'Preparing the form request',
                message: 'Preparing form changes',
                detail: 'Saved your request and loading the current form context.'
            });
            await progressChain;
            const rawHistory = await models.AssistantMessage.findAll({
                where: { threadId: state.threadId },
                order: [['createdAt', 'DESC']],
                limit: FORM_AI_HISTORY_LIMIT + 2
            });
            const history = rawHistory.reverse()
                .filter(message => ![userMessage.id, reservation.workMessage.id].includes(message.id))
                .map(asJson);
            const pendingValue = asJson(pending);
            const pendingForAI = context.pendingProposal.mode === 'include' && pendingValue?.payload
                ? { ...pendingValue.payload, messageId: pendingValue.id }
                : null;
            const request = context.command.type === 'decide_for_me'
                ? `Resolve the active request using sensible defaults. Active request: ${context.intent.sourceText || 'the current form request'}`
                : context.command.text;

            const result = await runTurn({
                request,
                currentSchema: asJson(form),
                history,
                pendingProposal: pendingForAI,
                clarificationMode: mode,
                turnContext: context.intent,
                resourceContext,
                onProgress: reportProgress,
                provider
            });
            await progressChain;
            const messageData = messageFromResult(result, asJson(form));
            messageData.tokenUsage = result?.tokenUsage || null;
            if (messageData.proposal) messageData.proposal.baseFormUpdatedAt ||= form.updatedAt;

            let response;
            await db.transaction(async transaction => {
                const freshState = await loadState(formId, transaction, form.userId);
                if (freshState.inFlightRequestId !== requestId) {
                    response = { userMsg: asJson(userMessage), botMsg: null, state: asJson(freshState), superseded: true };
                    return;
                }
                let supersededMessageIds = [];
                const pendingProposalDisposition = result?.pendingProposalDisposition || null;
                const closesPendingProposal = ['supersede', 'stale'].includes(pendingProposalDisposition);
                const staleProposalMessageIds = [];
                const assistantMessage = await models.AssistantMessage.findOne({ where: { id: reservation.workMessage.id, threadId: state.threadId }, transaction });
                if (pendingProposalDisposition === 'stale' && pending?.id) {
                    const pendingMessage = await models.AssistantMessage.findOne({ where: { id: pending.id, threadId: state.threadId }, transaction });
                    if (pendingMessage?.proposalStatus === 'pending') {
                        await pendingMessage.update({
                            proposalStatus: 'stale',
                            payload: {
                                ...(pendingMessage.payload || {}),
                                staleReason: 'FORM_VERSION_CHANGED',
                                work: finishAssistantWork(pendingMessage.payload?.work, { status: 'failed', detail: 'The form changed before this proposal could be revised.' }, now())
                            }
                        }, { transaction });
                        staleProposalMessageIds.push(pendingMessage.id);
                    }
                }
                if (messageData.proposal || pendingProposalDisposition === 'supersede') {
                    supersededMessageIds = await supersedePendingFormChatProposals({
                        formId,
                        transaction,
                        supersededBy: assistantMessage?.id || null,
                        messageModel: models.AssistantMessage,
                        threadId: state.threadId
                    });
                }
                const kind = messageData.proposal ? 'form_proposal' : messageData.options ? 'clarification' : 'text';
                const work = finishAssistantWork(assistantMessage?.payload?.work, {
                    status: messageData.proposal ? 'awaiting_review' : messageData.options ? 'needs_input' : 'completed',
                    detail: messageData.text
                }, now());
                await assistantMessage.update({
                    text: messageData.text,
                    kind,
                    payload: { ...(messageData.proposal || messageData.options || {}), work },
                    proposalStatus: messageData.proposal ? 'pending' : null,
                    tokenUsage: messageData.tokenUsage
                }, { transaction });
                const statePatch = statePatchForResult({
                    result,
                    command: context.command,
                    proposalMessageId: assistantMessage.id,
                    previousActiveProposalMessageId: closesPendingProposal ? null : state.activeProposalMessageId
                });
                const terminalOutcome = outcomeForAssistantMessage({ kind });
                await freshState.update({
                    ...statePatch,
                    version: freshState.version + 1,
                    mode,
                    inFlightRequestId: null,
                    inFlightStartedAt: null,
                    inFlightLastActivityAt: null,
                    progress: null,
                    lastTurn: {
                        requestId,
                        status: terminalOutcome === 'error' ? 'failed' : 'completed',
                        outcome: terminalOutcome,
                        messageId: assistantMessage.id,
                        completedAt: now().toISOString()
                    }
                }, { transaction });
                response = {
                    userMsg: asJson(userMessage),
                    botMsg: { ...asJson(assistantMessage), supersededMessageIds },
                    staleProposalMessageIds,
                    result,
                    state: asJson(freshState)
                };
            });
            return response;
        } catch (error) {
            // Progress persistence is intentionally queued so model callbacks do
            // not block. Drain that queue before writing the terminal failure,
            // otherwise a late attempt can replace the failed work snapshot.
            await progressChain.catch(() => {});
            const recovery = buildAssistantRecovery({
                surface: 'form',
                code: error.code || 'FORM_AI_GENERATION_FAILED',
                issues: error.issues || [],
                context: { formId, retryText: userMessage?.text || command.text }
            });
            const safeMessage = recovery.summary;
            let response;
            await db.transaction(async transaction => {
                const freshState = await loadState(formId, transaction, form.userId);
                if (freshState.inFlightRequestId !== requestId) {
                    response = { userMsg: asJson(userMessage), botMsg: null, state: asJson(freshState), superseded: true };
                    return;
                }
                const assistantMessage = await models.AssistantMessage.findOne({ where: { id: reservation.workMessage.id, threadId: state.threadId }, transaction });
                const errorMetadata = {
                    code: error.code || 'FORM_AI_GENERATION_FAILED',
                    retryable: recovery.retryable,
                    recovery
                };
                await assistantMessage.update({
                    text: safeMessage,
                    kind: 'error',
                    payload: { ...errorMetadata, work: finishAssistantWork(assistantMessage?.payload?.work, { status: 'failed', detail: safeMessage }, now()) },
                    isError: true,
                    errorMetadata
                }, { transaction });
                await freshState.update({
                    // A failed follow-up must never discard an earlier proposal
                    // that is still awaiting the user's decision.
                    phase: freshState.activeProposalMessageId ? 'awaiting_proposal' : 'idle',
                    openClarification: null,
                    activeWork: null,
                    version: freshState.version + 1,
                    inFlightRequestId: null,
                    inFlightStartedAt: null,
                    inFlightLastActivityAt: null,
                    progress: null,
                    lastTurn: {
                        requestId,
                        status: 'failed',
                        outcome: 'error',
                        messageId: assistantMessage.id,
                        completedAt: now().toISOString()
                    }
                }, { transaction });
                response = {
                    userMsg: asJson(userMessage),
                    botMsg: asJson(assistantMessage),
                    state: asJson(freshState),
                    error: { code: error.code, message: safeMessage }
                };
            });
            return response;
        }
    };

    const getHistory = async ({ userId, formId, limit = 50, before = null } = {}) => {
        const form = await models.Form.findOne({ where: { id: formId, userId } });
        if (!form) {
            const error = new Error('Form not found');
            error.status = 404;
            throw error;
        }
        return db.transaction(async transaction => {
            const state = await loadState(formId, transaction, userId);
            await recoverStaleTurn({ state, formId, transaction });
            const where = { threadId: state.threadId };
            if (before) {
                const cursor = await models.AssistantMessage.findOne({ where: { id: before, threadId: state.threadId }, transaction });
                if (cursor?.createdAt) where.createdAt = { [Op.lt]: cursor.createdAt };
            }
            const pageSize = Math.min(Math.max(Number(limit) || 50, 1), MAX_HISTORY);
            const messages = await models.AssistantMessage.findAll({
                where,
                order: [['createdAt', 'DESC']],
                limit: pageSize,
                transaction
            });
            const nextBefore = messages.length >= pageSize ? messages[messages.length - 1]?.id || null : null;
            return {
                messages: messages.reverse().map(publicMessage),
                // Results are fetched newest-first, then returned chronologically.
                // The next page must start before the oldest item in this page.
                nextBefore,
                state: state.toJSON()
            };
        });
    };

    const clearChat = async ({ userId, formId } = {}) => {
        return db.transaction(async transaction => {
            const form = await models.Form.findOne({ where: { id: formId, userId }, transaction, lock: transaction.LOCK.UPDATE });
            if (!form) {
                const error = new Error('Form not found');
                error.status = 404;
                throw error;
            }
            const state = await loadState(formId, transaction, userId);
            if (state.inFlightRequestId) {
                const error = new Error('The form AI is still processing a request. Wait for it to finish before clearing the chat.');
                error.code = 'FORM_AI_TURN_IN_PROGRESS';
                error.status = 409;
                throw error;
            }
            const deletedMessages = await models.AssistantMessage.destroy({ where: { threadId: state.threadId }, transaction });
            await state.update({
                version: state.version + 1,
                phase: 'idle',
                activeWork: null,
                openClarification: null,
                activeProposalMessageId: null,
                inFlightRequestId: null,
                inFlightStartedAt: null,
                inFlightLastActivityAt: null,
                progress: null,
                lastTurn: null
            }, { transaction });
            return { cleared: true, deletedMessages, state: asJson(state) };
        });
    };

    const resetContext = async ({ userId, formId } = {}) => db.transaction(async transaction => {
        const form = await models.Form.findOne({ where: { id: formId, userId }, transaction, lock: transaction.LOCK.UPDATE });
        if (!form) {
            const error = new Error('Form not found');
            error.status = 404;
            throw error;
        }
        const state = await loadState(formId, transaction, userId);
        if (state.inFlightRequestId) {
            const error = new Error('The form AI is still processing a request.');
            error.code = 'FORM_AI_TURN_IN_PROGRESS';
            error.status = 409;
            throw error;
        }
        const { resourceBrief, ...context } = state.context || {};
        await state.updateContext(context, { transaction });
        await state.update({ version: state.version + 1 }, { transaction });
        return { reset: true, state: asJson(state) };
    });

    const decideProposal = async ({
        userId,
        formId,
        proposalMessageId,
        action = 'accept',
        selectedPatchIds,
        expectedStateVersion = null,
        fieldDeletionReview = null
    } = {}) => {
        let response;
        let deferredError = null;
        let nextState = null;
        await db.transaction(async transaction => {
            const form = await models.Form.findOne({ where: { id: formId, userId }, transaction });
            if (!form) {
                const error = new Error('Form not found');
                error.status = 404;
                throw error;
            }
            const state = await loadState(formId, transaction, userId);
            if (Number.isInteger(expectedStateVersion) && state.version !== expectedStateVersion) {
                const error = new Error('The form AI conversation changed. Refresh and try again.');
                error.code = 'FORM_AI_STATE_CONFLICT';
                error.status = 409;
                error.currentStateVersion = state.version;
                throw error;
            }
            const message = await models.AssistantMessage.findOne({ where: { id: proposalMessageId, threadId: state.threadId }, transaction });
            if (!message) {
                const error = new Error('Proposal message not found');
                error.status = 404;
                throw error;
            }
            if (message.sender !== 'bot' || message.proposalStatus !== 'pending') {
                const error = new Error('This proposal is no longer pending.');
                error.status = 409;
                error.code = 'FORM_PROPOSAL_NOT_PENDING';
                throw error;
            }

            const proposal = message.payload || {};
            if (action === 'reject' || action === 'ignore') {
                await message.update({
                    payload: { ...proposal, work: finishAssistantWork(proposal.work, { status: 'ignored', detail: 'Proposal ignored' }, now()) },
                    proposalStatus: 'rejected'
                }, { transaction });
                if (state?.activeProposalMessageId === message.id) {
                    await state.update({
                        phase: 'idle',
                        activeProposalMessageId: null,
                        openClarification: null,
                        activeWork: null,
                        version: state.version + 1
                    }, { transaction });
                    nextState = asJson(state);
                }
                response = { form: asJson(form), message: asJson(message), state: nextState };
                return;
            }

            const proposalPatches = Array.isArray(proposal.patches) ? proposal.patches : [];
            const patchesWithIds = proposalPatches.map((patch, index) => ({
                ...patch,
                patchId: patch.patchId || `patch_${index + 1}`
            }));
            const requestedPatchIds = selectedPatchIds === undefined
                ? patchesWithIds.map(patch => patch.patchId)
                : selectedPatchIds;
            if (!Array.isArray(requestedPatchIds)) {
                const error = new Error('selectedPatchIds must be an array.');
                error.status = 400;
                throw error;
            }
            const patchIds = new Set(patchesWithIds.map(patch => patch.patchId));
            if (requestedPatchIds.some(patchId => !patchIds.has(patchId))) {
                const error = new Error('The proposal contains an unknown patch selection.');
                error.status = 400;
                throw error;
            }

            const expectedRevision = proposal.baseFormUpdatedAt;
            if (expectedRevision && new Date(form.updatedAt).getTime() !== new Date(expectedRevision).getTime()) {
                await message.update({
                    payload: { ...proposal, staleReason: 'FORM_VERSION_CHANGED', work: finishAssistantWork(proposal.work, { status: 'failed', detail: 'The form changed before this proposal could be applied.' }, now()) },
                    proposalStatus: 'stale'
                }, { transaction });
                if (state?.activeProposalMessageId === message.id) {
                    await state.update({
                        phase: 'idle',
                        activeProposalMessageId: null,
                        openClarification: null,
                        activeWork: null,
                        version: state.version + 1
                    }, { transaction });
                }
                deferredError = new Error('This proposal was created from an older form version. Generate a new suggestion.');
                deferredError.status = 409;
                deferredError.code = 'FORM_PROPOSAL_STALE';
                return;
            }

            const selectedPatches = patchesWithIds.filter(patch => requestedPatchIds.includes(patch.patchId));
            let applied;
            try {
                applied = applyFormPatches({ currentSchema: asJson(form), patches: selectedPatches });
            } catch (error) {
                error.status = 400;
                throw error;
            }
            const cardinalityIssue = validateQuestionCardinality({ schema: applied.schema, cardinality: proposal.cardinality });
            if (cardinalityIssue) {
                const error = new Error('The selected changes no longer satisfy the requested question count.');
                error.status = 400;
                error.code = 'FORM_PROPOSAL_CARDINALITY_MISMATCH';
                error.issues = [cardinalityIssue];
                throw error;
            }

            const appliedChange = await applyFormChange({
                formId,
                userId,
                nextSchema: applied.schema,
                expectedFormUpdatedAt: expectedRevision,
                workflowRevisions: fieldDeletionReview?.workflowRevisions,
                reviewConfirmed: fieldDeletionReview?.confirmed === true,
                transaction,
                models: models.Workflow ? models : { Form: models.Form },
                db,
                saveDraft: undefined
            });
            const appliedForm = appliedChange.form;
            await message.update({
                payload: {
                    ...proposal,
                    schema: appliedForm.toJSON?.() || appliedForm,
                    work: finishAssistantWork(proposal.work, { status: 'applied', detail: 'Changes applied to the form.' }, now()),
                    patches: applied.patches,
                    selectedPatchIds: requestedPatchIds
                },
                proposalStatus: 'applied'
            }, { transaction });
            if (state) {
                await state.updateContext(applyResourceContextDelta({
                    context: state.context,
                    delta: proposal.contextDelta,
                    identity: buildResourceIdentity({ surface: 'form', resource: asJson(appliedForm) })
                }), { transaction });
                await state.update({
                    phase: 'idle',
                    activeProposalMessageId: null,
                    openClarification: null,
                    activeWork: null,
                    version: state.version + 1
                }, { transaction });
                nextState = asJson(state);
            }
            response = { form: asJson(appliedForm), message: asJson(message), state: nextState };
        });
        if (deferredError) throw deferredError;
        return response;
    };

    return { getHistory, submitTurn, clearChat, resetContext, decideProposal };
};

export const formAssistant = createFormAssistant();
