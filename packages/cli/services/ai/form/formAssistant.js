import crypto from 'crypto';
import sequelize from '../../../db/index.js';
import { Form, FormAIState, FormChatMessage } from '../../../models/index.js';
import { runFormTurn } from '../formAIService.js';
import { FORM_AI_HISTORY_LIMIT, validateQuestionCardinality } from './context/formContext.js';
import { applyFormPatches } from './domain/formPatchEngine.js';
import { normalizeClarificationMode } from '../../../../shared/agentContract.js';
import { resolveFormTurnContext, detectFormIntentScope } from './domain/formTurnContext.js';
import { supersedePendingFormChatProposals } from '../../proposalLifecycle.js';

const IN_FLIGHT_TIMEOUT_MS = 10 * 60 * 1000;

const makeId = prefix => `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;

const asJson = value => (value && typeof value.toJSON === 'function' ? value.toJSON() : value);

const toCommand = ({ command, text } = {}) => {
    if (command && typeof command === 'object' && command.type === 'decide_for_me') {
        return { type: 'decide_for_me', clarificationId: command.clarificationId || null };
    }
    if (command && typeof command === 'object' && command.type === 'submit_text') {
        return { type: 'submit_text', text: String(command.text || '').trim() };
    }
    return { type: 'submit_text', text: typeof text === 'string' ? text.trim() : '' };
};

const messageFromResult = result => {
    const text = result?.message || result?.text || 'I could not find a safe change to make.';
    if (result?.kind === 'proposal' || result?.type === 'proposal') {
        return {
            text,
            proposal: {
                schema: result.schema,
                patches: result.patches,
                requirements: result.requirements,
                verification: result.verification,
                warnings: result.warnings || [],
                cardinality: result.cardinality,
                baseFormUpdatedAt: result.baseFormUpdatedAt,
                status: 'pending'
            }
        };
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
    models = { Form, FormAIState, FormChatMessage },
    db = sequelize,
    runTurn = runFormTurn,
    now = () => new Date(),
    idFactory = makeId
} = {}) => {
    const loadState = async (formId, transaction) => {
        const lock = transaction?.LOCK?.UPDATE ? { lock: transaction.LOCK.UPDATE } : {};
        const existing = await models.FormAIState.findOne({ where: { formId }, transaction, ...lock });
        if (existing) return existing;
        const [state] = await models.FormAIState.findOrCreate({
            where: { formId },
            defaults: { formId },
            transaction
        });
        return state;
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

            const state = await loadState(formId, transaction);
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
                ? await models.FormChatMessage.findOne({ where: { id: state.activeProposalMessageId, formId }, transaction })
                : null;
            const context = resolveFormTurnContext({
                command,
                clarification: state.openClarification
                    ? { ...state.openClarification, id: state.openClarification.id || 'active' }
                    : null,
                activeWork: state.activeWork,
                pendingProposal: asJson(pending)?.proposal || null,
                clarificationMode: mode
            });
            const userMessage = await models.FormChatMessage.create({
                id: idFactory('fmsg'),
                formId,
                sender: 'user',
                text: command.type === 'decide_for_me' ? 'Use sensible defaults.' : command.text
            }, { transaction });

            await state.update({
                version: state.version + 1,
                mode,
                inFlightRequestId: requestId,
                inFlightStartedAt: now()
            }, { transaction });

            reservation = { form, state, pending, context, userMessage };
        });

        const { form, state, pending, context, userMessage } = reservation;
        try {
            const rawHistory = await models.FormChatMessage.findAll({
                where: { formId },
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
                onProgress,
                provider
            });
            const messageData = messageFromResult(result);
            messageData.tokenUsage = result?.tokenUsage || null;
            if (messageData.proposal) messageData.proposal.baseFormUpdatedAt ||= form.updatedAt;

            let response;
            await db.transaction(async transaction => {
                let supersededMessageIds = [];
                if (messageData.proposal?.status === 'pending') {
                    supersededMessageIds = await supersedePendingFormChatProposals({
                        formId,
                        transaction,
                        supersededBy: null,
                        messageModel: models.FormChatMessage
                    });
                }
                const assistantMessage = await models.FormChatMessage.create({
                    id: idFactory('fmsg'),
                    formId,
                    sender: 'bot',
                    text: messageData.text,
                    proposal: messageData.proposal || null,
                    options: messageData.options || null,
                    tokenUsage: messageData.tokenUsage
                }, { transaction });
                const statePatch = statePatchForResult({ result, command: context.command, form, proposalMessageId: assistantMessage.id });
                const freshState = await models.FormAIState.findOne({ where: { formId }, transaction });
                await freshState.update({
                    ...statePatch,
                    version: freshState.version + 1,
                    mode,
                    inFlightRequestId: null,
                    inFlightStartedAt: null
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
                const assistantMessage = await models.FormChatMessage.create({
                    id: idFactory('fmsg'),
                    formId,
                    sender: 'bot',
                    text: safeMessage,
                    isError: true,
                    errorMetadata: {
                        code: error.code || 'FORM_AI_GENERATION_FAILED',
                        retryable: error.status !== 404
                    }
                }, { transaction });
                const freshState = await models.FormAIState.findOne({ where: { formId }, transaction });
                await freshState.update({
                    phase: 'idle',
                    openClarification: null,
                    activeWork: null,
                    activeProposalMessageId: null,
                    version: freshState.version + 1,
                    inFlightRequestId: null,
                    inFlightStartedAt: null
                }, { transaction });
                response = { userMsg: asJson(userMessage), botMsg: asJson(assistantMessage), error: { code: error.code, message: safeMessage } };
            });
            return response;
        }
    };

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
            const message = await models.FormChatMessage.findOne({ where: { id: proposalMessageId, formId }, transaction });
            if (!message) {
                const error = new Error('Proposal message not found');
                error.status = 404;
                throw error;
            }
            if (message.sender !== 'bot' || message.proposal?.status !== 'pending') {
                const error = new Error('This proposal is no longer pending.');
                error.status = 409;
                error.code = 'FORM_PROPOSAL_NOT_PENDING';
                throw error;
            }

            const proposal = message.proposal || {};
            if (action === 'reject' || action === 'ignore') {
                await message.update({ proposal: { ...proposal, status: 'rejected' } }, { transaction });
                const state = await models.FormAIState.findOne({ where: { formId }, transaction });
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
                response = { form: asJson(form), proposal: asJson(message).proposal, state: nextState };
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

            const expectedRevision = baseFormUpdatedAt || proposal.baseFormUpdatedAt;
            if (expectedRevision && new Date(form.updatedAt).getTime() !== new Date(expectedRevision).getTime()) {
                await message.update({ proposal: { ...proposal, status: 'stale', staleReason: 'FORM_VERSION_CHANGED' } }, { transaction });
                const state = await models.FormAIState.findOne({ where: { formId }, transaction });
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
                proposal: {
                    ...proposal,
                    schema: applied.schema,
                    patches: applied.patches,
                    selectedPatchIds: requestedPatchIds,
                    status: 'accepted'
                }
            }, { transaction });
            const state = await models.FormAIState.findOne({ where: { formId }, transaction });
            if (state) {
                await state.update({
                    phase: 'idle',
                    activeProposalMessageId: null,
                    openClarification: null,
                    activeWork: null,
                    version: state.version + 1
                }, { transaction });
                nextState = asJson(state);
            }
            response = { form: asJson(form), proposal: asJson(message).proposal, state: nextState };
        });
        if (deferredError) throw deferredError;
        return response;
    };

    return { submitTurn, decideProposal };
};

export const formAssistant = createFormAssistant();
