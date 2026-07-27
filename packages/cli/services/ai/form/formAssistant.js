import crypto from 'crypto';
import sequelize from '../../../db/index.js';
import { AssistantMessage, AssistantThread, Form } from '../../../models/index.js';
import { createAssistantStateView, ensureAssistantThread } from '../../assistant/assistantStore.js';
import { runFormTurn } from '../formAIService.js';
import { FORM_AI_HISTORY_LIMIT, validateQuestionCardinality } from './context/formContext.js';
import { applyFormPatches } from './domain/formPatchEngine.js';
import { normalizeClarificationMode } from '../../../../shared/agentContract.js';
import { resolveFormTurnContext, detectFormIntentScope } from './domain/formTurnContext.js';
import { supersedePendingFormChatProposals } from '../../proposalLifecycle.js';
import { applyResourceContextDelta, buildResourceIdentity, resourceContextForPrompt } from '../../assistant/resourceContext.js';
import { buildFormPresentation } from '../../assistant/proposalPresentation.js';

const IN_FLIGHT_TIMEOUT_MS = 10 * 60 * 1000;

const makeId = prefix => `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;

const asJson = value => (value && typeof value.toJSON === 'function' ? value.toJSON() : value);

const progressSnapshot = (progress, now = () => new Date()) => ({
    status: String(progress?.status || 'working').trim() || 'working',
    message: String(progress?.message || 'Working on your form…').trim() || 'Working on your form…',
    updatedAt: now().toISOString()
});

const toCommand = ({ command, text } = {}) => {
    if (command && typeof command === 'object' && command.type === 'decide_for_me') {
        return { type: 'decide_for_me', clarificationId: command.clarificationId || null };
    }
    if (command && typeof command === 'object' && command.type === 'submit_clarification') {
        return { type: 'submit_clarification', text: String(command.text || '').trim(), state: command.state };
    }
    if (command && typeof command === 'object' && command.type === 'submit_text') {
        return { type: 'submit_text', text: String(command.text || '').trim() };
    }
    return { type: 'submit_text', text: typeof text === 'string' ? text.trim() : '' };
};

const messageFromResult = (result, form = {}) => {
    const text = result?.message || result?.text || 'I could not find a safe change to make.';
    if (result?.kind === 'proposal' || result?.type === 'proposal') {
        const proposal = {
            schema: result.schema,
            patches: result.patches,
            requirements: result.requirements,
            verification: result.verification,
            warnings: result.warnings || [],
            cardinality: result.cardinality,
            contextDelta: result.contextDelta || null,
            baseFormUpdatedAt: result.baseFormUpdatedAt
        };
        const presentation = buildFormPresentation({ form, proposal });
        return { text: presentation.outcome, proposal: { ...proposal, presentation } };
    }

    if (result?.kind === 'clarification' || result?.type === 'message') {
        return {
            text,
            options: {
                clarificationId: makeId('clarification'),
                inputs: result.inputs || result.options || [],
                allowDecide: true
            }
        };
    }

    return { text };
};

const statePatchForResult = ({ result, command, form, proposalMessageId = null }) => {
    const isClarification = result?.kind === 'clarification' || result?.type === 'message';
    const isProposal = result?.kind === 'proposal' || result?.type === 'proposal';
    const sourceText = command.type === 'decide_for_me'
        ? null
        : (typeof command.text === 'string' ? command.text.trim() : null);

    return {
        phase: isClarification ? 'awaiting_clarification' : (isProposal ? 'awaiting_proposal' : 'idle'),
        openClarification: isClarification ? { message: result.message, inputs: result.inputs || result.options || [] } : null,
        activeProposalMessageId: isProposal ? proposalMessageId : null,
        activeWork: isClarification
            ? { id: makeId('work'), sourceText, scope: detectFormIntentScope(sourceText), updatedAt: new Date().toISOString() }
            : null,
    };
};

export const createFormAssistant = ({
    models = { Form, AssistantThread, AssistantMessage },
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

    const submitTurn = async ({
        userId,
        formId,
        command: rawCommand,
        text,
        clarificationMode,
        expectedStateVersion = null,
        requestId = idFactory('request'),
        provider = null,
        onProgress = null
    } = {}) => {
        const command = toCommand({ command: rawCommand, text });
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
            if (Number.isInteger(expectedStateVersion) && state.version !== expectedStateVersion) {
                const error = new Error('The form AI conversation changed. Refresh and try again.');
                error.code = 'FORM_AI_STATE_CONFLICT';
                error.status = 409;
                throw error;
            }
            if (state.inFlightRequestId && state.inFlightStartedAt) {
                const age = now().getTime() - new Date(state.inFlightStartedAt).getTime();
                if (age < IN_FLIGHT_TIMEOUT_MS && state.inFlightRequestId !== requestId) {
                    const error = new Error('Another form AI request is already being processed.');
                    error.code = 'FORM_AI_TURN_IN_PROGRESS';
                    error.status = 409;
                    throw error;
                }
            }

            const pending = state.activeProposalMessageId
                ? await models.AssistantMessage.findOne({ where: { id: state.activeProposalMessageId, threadId: state.threadId }, transaction })
                : null;

            if (state.openClarification && command.type === 'submit_clarification' && command.state) {
                const clarificationMessage = await models.AssistantMessage.findOne({
                    where: { threadId: state.threadId, sender: 'bot', kind: 'clarification' },
                    order: [['createdAt', 'DESC']],
                    transaction
                });
                if (clarificationMessage) {
                    await clarificationMessage.update({
                        payload: { ...clarificationMessage.payload, selectedState: command.state }
                    }, { transaction });
                }
            }

            const context = resolveFormTurnContext({
                command,
                clarification: state.openClarification
                    ? { ...state.openClarification, id: state.openClarification.id || 'active' }
                    : null,
                activeWork: state.activeWork,
                pendingProposal: asJson(pending)?.proposal || null,
                clarificationMode: mode
            });
            const userMessage = await models.AssistantMessage.create({
                id: idFactory('fmsg'),
                threadId: state.threadId,
                sender: 'user',
                text: command.type === 'decide_for_me' ? 'Use sensible defaults.' : command.text
            }, { transaction });

            await state.update({
                version: state.version + 1,
                phase: 'processing',
                mode,
                inFlightRequestId: requestId,
                inFlightStartedAt: now(),
                progress: progressSnapshot({ status: 'starting', message: 'Preparing form changes…' }, now)
            }, { transaction });

            reservation = { form, state, pending, context, userMessage, resourceContext: resourceContextForPrompt({
                identity: buildResourceIdentity({ surface: 'form', resource: asJson(form) }),
                context: state.context
            }) };
        });

        const { form, state, pending, context, userMessage, resourceContext } = reservation;
        let progressChain = Promise.resolve();
        const reportProgress = progress => {
            const snapshot = progressSnapshot(progress, now);
            onProgress?.(snapshot);
            progressChain = progressChain.then(() => db.transaction(async transaction => {
                const freshState = await loadState(formId, transaction, userId);
                if (freshState.inFlightRequestId !== requestId) return;
                await freshState.update({ phase: 'processing', progress: snapshot }, { transaction });
            }));
        };
        try {
            const rawHistory = await models.AssistantMessage.findAll({
                where: { threadId: state.threadId },
                order: [['createdAt', 'DESC']],
                limit: FORM_AI_HISTORY_LIMIT + 2
            });
            const history = rawHistory.reverse()
                .filter(message => message.id !== userMessage.id)
                .map(asJson);
            const pendingForAI = context.pendingProposal.mode === 'include'
                ? asJson(pending)?.proposal || null
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
                let supersededMessageIds = [];
                if (messageData.proposal) {
                    supersededMessageIds = await supersedePendingFormChatProposals({
                        formId,
                        transaction,
                        supersededBy: null,
                        messageModel: models.AssistantMessage,
                        threadId: state.threadId
                    });
                }
                const assistantMessage = await models.AssistantMessage.create({
                    id: idFactory('fmsg'),
                    threadId: state.threadId,
                    sender: 'bot',
                    text: messageData.text,
                    kind: messageData.proposal ? 'form_proposal' : messageData.options ? 'clarification' : 'text',
                    payload: messageData.proposal || messageData.options || null,
                    proposalStatus: messageData.proposal ? 'pending' : null,
                    tokenUsage: messageData.tokenUsage
                }, { transaction });
                const statePatch = statePatchForResult({ result, command: context.command, form, proposalMessageId: assistantMessage.id });
                const freshState = await loadState(formId, transaction, form.userId);
                await freshState.update({
                    ...statePatch,
                    version: freshState.version + 1,
                    mode,
                    inFlightRequestId: null,
                    inFlightStartedAt: null,
                    progress: null
                }, { transaction });
                response = {
                    userMsg: asJson(userMessage),
                    botMsg: { ...asJson(assistantMessage), supersededMessageIds },
                    result,
                    state: asJson(freshState)
                };
            });
            return response;
        } catch (error) {
            const safeMessage = error.message || 'Form AI could not complete this request.';
            let response;
            await db.transaction(async transaction => {
                const assistantMessage = await models.AssistantMessage.create({
                    id: idFactory('fmsg'),
                    threadId: state.threadId,
                    sender: 'bot',
                    text: safeMessage,
                    isError: true,
                    errorMetadata: {
                        code: error.code || 'FORM_AI_GENERATION_FAILED',
                        retryable: error.status !== 404
                    }
                }, { transaction });
                const freshState = await loadState(formId, transaction, form.userId);
                await freshState.update({
                    phase: 'idle',
                    openClarification: null,
                    activeWork: null,
                    activeProposalMessageId: null,
                    version: freshState.version + 1,
                    inFlightRequestId: null,
                    inFlightStartedAt: null,
                    progress: null
                }, { transaction });
                response = { userMsg: asJson(userMessage), botMsg: asJson(assistantMessage), error: { code: error.code, message: safeMessage } };
            });
            return response;
        }
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
                progress: null
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
        baseFormUpdatedAt
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
                await message.update({ payload: proposal, proposalStatus: 'rejected' }, { transaction });
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
                response = { form: asJson(form), proposal: { ...(asJson(message).proposal || {}), status: message.proposalStatus }, state: nextState };
                return;
            }

            if (proposal.verification?.status !== 'pass') {
                const error = new Error('This proposal still needs verification before it can be applied.');
                error.status = 409;
                error.code = 'FORM_PROPOSAL_UNVERIFIED';
                throw error;
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

            const expectedRevision = baseFormUpdatedAt || proposal.baseFormUpdatedAt;
            if (expectedRevision && new Date(form.updatedAt).getTime() !== new Date(expectedRevision).getTime()) {
                await message.update({ payload: { ...proposal, staleReason: 'FORM_VERSION_CHANGED' }, proposalStatus: 'stale' }, { transaction });
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

            await form.update({
                title: applied.schema.title,
                description: applied.schema.description,
                settings: applied.schema.settings,
                fields: applied.schema.fields
            }, { transaction });
            await message.update({
                payload: {
                    ...proposal,
                    schema: applied.schema,
                    patches: applied.patches,
                    selectedPatchIds: requestedPatchIds
                },
                proposalStatus: 'applied'
            }, { transaction });
            if (state) {
                await state.updateContext(applyResourceContextDelta({
                    context: state.context,
                    delta: proposal.contextDelta,
                    identity: buildResourceIdentity({ surface: 'form', resource: asJson(form) })
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
            response = { form: asJson(form), proposal: { ...(asJson(message).proposal || {}), status: message.proposalStatus }, state: nextState };
        });
        if (deferredError) throw deferredError;
        return response;
    };

    return { submitTurn, clearChat, resetContext, decideProposal };
};

export const formAssistant = createFormAssistant();
