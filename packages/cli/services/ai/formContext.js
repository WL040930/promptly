import {
    FORM_AI_MEMORY_LIMIT as SHARED_FORM_AI_MEMORY_LIMIT,
    FORM_SETTINGS_KEYS,
    isEmptyFormMemorySummary
} from '../../../shared/formContract.js';
import { getClarificationModeInstruction, normalizeClarificationMode } from '../../../shared/agentContract.js';

export const FORM_AI_HISTORY_LIMIT = 6;
const FORM_AI_MEMORY_LIMIT = SHARED_FORM_AI_MEMORY_LIMIT;
export const FORM_AI_CONTEXT_LIMIT = 12000;
const NON_QUESTION_FIELD_TYPES = new Set(['heading', 'hidden']);

const clampText = (value, limit) => String(value || '').trim().slice(0, limit);
const FORM_AI_FIELD_KEYS = Object.freeze([
    'id',
    'type',
    'label',
    'required',
    'choices',
    'description',
    'placeholder',
    'min',
    'max',
    'maxRating',
    'rows'
]);

export const readFormMemory = (schema = {}) => {
    const storedMemory = schema.settings?.aiMemory;
    if (!storedMemory) return null;

    if (typeof storedMemory === 'string') {
        const summary = clampText(storedMemory, FORM_AI_MEMORY_LIMIT);
        return summary && !isEmptyFormMemorySummary(summary) ? { version: 1, summary } : null;
    }

    if (typeof storedMemory === 'object' && storedMemory.summary) {
        const summary = clampText(storedMemory.summary, FORM_AI_MEMORY_LIMIT);
        return summary && !isEmptyFormMemorySummary(summary) ? {
            version: storedMemory.version || 1,
            summary,
            ...(storedMemory.updatedAt ? { updatedAt: storedMemory.updatedAt } : {})
        } : null;
    }

    return null;
};

const compactField = (field = {}) => Object.fromEntries(
    FORM_AI_FIELD_KEYS
        .filter(key => field[key] !== undefined && key !== 'choices')
        .map(key => [
            key,
            typeof field[key] === 'string' ? clampText(field[key], key === 'label' ? 255 : 300) : field[key]
        ])
        .concat(Array.isArray(field.choices)
            ? [['choices', field.choices.map(choice => clampText(choice, 255))]]
            : [])
);

export const compactFormSchema = (schema = {}) => {
    const { title, description, fields = [], settings = {} } = schema;
    const compactSettings = Object.fromEntries(
        FORM_SETTINGS_KEYS
            .filter(key => settings[key] !== undefined)
            .map(key => [key, settings[key]])
    );

    return {
        title: clampText(title, 255),
        description: clampText(description, 1000),
        settings: compactSettings,
        fields: Array.isArray(fields) ? fields.map(compactField) : []
    };
};

export const getActiveQuestionCount = (schema = {}) => (Array.isArray(schema.fields) ? schema.fields : [])
    .filter(field => !field?.deleted && !NON_QUESTION_FIELD_TYPES.has(field?.type))
    .length;

export const validateQuestionCardinality = ({ schema = {}, cardinality = null } = {}) => {
    if (!cardinality || !Number.isInteger(cardinality.targetCount)) return null;
    const actualCount = getActiveQuestionCount(schema);
    if (actualCount === cardinality.targetCount) return null;
    return {
        code: 'QUESTION_COUNT_MISMATCH',
        path: 'patches',
        message: `The selected changes produce ${actualCount} active questions; the proposal requires ${cardinality.targetCount}.`
    };
};

const getRequestedQuestionSpec = prompt => {
    const text = clampText(prompt, FORM_AI_CONTEXT_LIMIT);
    if (!text) return null;

    const totalMatch = text.match(/\b(?:total(?:\s+of)?|exactly)\s+(\d+)\s+(?:questions?|fields?)\b/i);
    const addMatch = text.match(/\badd\s+(?:exactly\s+)?(\d+)\s+(?:new\s+)?(?:questions?|fields?)\b/i);
    const formMatch = text.match(/\b(?:with|containing|contain)\s+(\d+)\s+(?:questions?|fields?)\b/i);
    const shapeMatch = text.match(/\b(\d+)[ -](?:question|field)s?\b/i);
    const count = totalMatch?.[1]
        || (addMatch && !/\btotal\b/i.test(text) ? addMatch[1] : null)
        || formMatch?.[1]
        || shapeMatch?.[1];

    const parsedCount = Number(count);
    if (!Number.isInteger(parsedCount) || parsedCount <= 0) return null;

    return {
        count: parsedCount,
        isAddRequest: Boolean(addMatch && !/\btotal\b/i.test(text))
    };
};

const getClarificationAnswerSpec = ({ chatHistory = [], prompt = '' } = {}) => {
    const latestUserIndex = [...chatHistory].map(message => message?.sender).lastIndexOf('user');
    if (latestUserIndex < 1) return null;
    const latestUserText = String(chatHistory[latestUserIndex]?.text || '').trim();
    if (latestUserText !== String(prompt || '').trim()) return null;

    const answer = chatHistory[latestUserIndex];
    const question = chatHistory[latestUserIndex - 1];
    if (question?.sender !== 'bot') return null;
    const questionText = String(question.text || '');
    if (!/\b(?:how many|number of|count|total)\b.*\b(?:question|field)/i.test(questionText)) return null;

    const answerText = String(answer.text || '').trim();
    const directCount = answerText.match(/^(\d+)\s*(?:questions?|fields?)?$/i)?.[1];
    const requested = getRequestedQuestionSpec(answerText);
    const count = directCount || requested?.count;
    if (count) {
        return {
            count: Number(count),
            isAddRequest: Boolean(requested?.isAddRequest)
        };
    }
    return null;
};

export const getQuestionCardinality = ({ schema = {}, prompt = '', chatHistory = [] } = {}) => {
    const requested = getRequestedQuestionSpec(prompt) || getClarificationAnswerSpec({ chatHistory, prompt });
    if (!requested) return null;

    const currentCount = getActiveQuestionCount(schema);
    const { count, isAddRequest } = requested;

    return {
        mode: isAddRequest ? 'add_questions' : 'total_questions',
        targetCount: isAddRequest ? currentCount + count : count,
        currentCount,
        additionalCount: isAddRequest ? count : Math.max(0, count - currentCount)
    };
};

const selectRecentMessages = (messages = []) => {
    const recentMessages = messages.slice(-FORM_AI_HISTORY_LIMIT);
    const selected = [];
    let totalCharacters = 0;

    for (let index = recentMessages.length - 1; index >= 0; index -= 1) {
        const message = recentMessages[index];
        const text = clampText(message.text, 1000);
        if (!text) continue;

        const line = `${message.sender === 'user' ? 'User' : 'Assistant'}: ${text}`;
        if (selected.length > 0 && totalCharacters + line.length > FORM_AI_CONTEXT_LIMIT) break;

        selected.unshift(line);
        totalCharacters += line.length;
    }

    return selected;
};

const compactPendingProposal = (messages = []) => {
    const pending = [...messages]
        .reverse()
        .find(message => message?.sender === 'bot' && message?.proposal?.status === 'pending');
    if (!pending?.proposal) return null;

    const proposal = pending.proposal;
    return {
        status: 'pending',
        message: clampText(pending.text, 600),
        patchCount: Array.isArray(proposal.patches) ? proposal.patches.length : 0,
        patchOperations: Array.isArray(proposal.patches)
            ? [...new Set(proposal.patches.map(patch => patch?.op).filter(Boolean))]
            : [],
        requirements: Array.isArray(proposal.requirements)
            ? proposal.requirements.slice(0, 8).map(requirement => ({
                id: clampText(requirement?.id, 100),
                description: clampText(requirement?.description, 300)
            }))
            : [],
        preview: proposal.schema ? compactFormSchema(proposal.schema) : null
    };
};

export const buildPlannerContext = ({ schema, chatHistory = [], prompt, clarificationMode, cardinality = null }) => {
    const memory = readFormMemory(schema);
    const recentConversation = selectRecentMessages(chatHistory);
    const pendingProposal = compactPendingProposal(chatHistory);

    return [
        'Persistent Form Memory:',
        memory?.summary || '(none)',
        '',
        'Current Form Schema:',
        JSON.stringify(compactFormSchema(schema)),
        '',
        'Question Count:',
        cardinality
            ? JSON.stringify(cardinality)
            : '(no explicit question count requested)',
        'If a total question count is present, it is the final number of active questions, not the number of new fields to add.',
        '',
        'Clarification:',
        `${normalizeClarificationMode(clarificationMode)} - ${getClarificationModeInstruction(clarificationMode)}`,
        '',
        'Recent Conversation:',
        recentConversation.length > 0 ? recentConversation.join('\n') : '(none)',
        '',
        'Pending Proposal:',
        pendingProposal
            ? JSON.stringify(pendingProposal)
            : '(none)',
        'If the user refers to the pending proposal, treat it as a draft to revise. Do not apply it and do not discard requested changes unless the user asks you to.',
        '',
        'Current Request:',
        clampText(prompt, FORM_AI_CONTEXT_LIMIT)
    ].join('\n');
};

export const buildWorkerContext = ({ schema, requirements = [], cardinality = null }) => [
    'Current Form Schema:',
    JSON.stringify(compactFormSchema(schema)),
    '',
    'Existing Field IDs (these are the only valid targets for update/remove):',
    JSON.stringify((Array.isArray(schema.fields) ? schema.fields : []).map(field => field.id).filter(Boolean)),
    'The form ID is not a field ID. Never use it as a patch id.',
    'Every add patch must include a complete field object with non-empty id, type, and label.',
    'Question Cardinality:',
    cardinality
        ? JSON.stringify(cardinality)
        : '(no explicit question count requested)',
    'For total_questions, the final active question count must equal targetCount. Add only additionalCount new questions unless the request explicitly removes or converts existing questions.',
    'For add_questions, add exactly additionalCount new questions. Count the additions before returning; do not stop after a partial list.',
    '',
    'Planner Requirements:',
    JSON.stringify(requirements)
].join('\n');

export const buildPlannerRepairContext = ({ response, issues, cardinality = null }) => [
    'Repair the planner response below and return a complete compact JSON response.',
    'Do not include worker instructions. Keep the summary and requirement descriptions concise.',
    '',
    'Validation Issues:',
    clampText(issues, 6000),
    '',
    'Question Cardinality:',
    cardinality ? JSON.stringify(cardinality) : '(none)',
    '',
    'Invalid Planner Response:',
    clampText(response, FORM_AI_CONTEXT_LIMIT)
].join('\n');

const summarizeField = (field = {}) => {
    const summary = {
        id: field.id,
        type: field.type,
        label: clampText(field.label, 120),
        required: field.required
    };
    if (Array.isArray(field.choices)) summary.choices = field.choices.slice(0, 8).map(choice => clampText(choice, 80));
    for (const key of ['description', 'placeholder', 'min', 'max', 'maxRating', 'rows']) {
        if (field[key] !== undefined) summary[key] = typeof field[key] === 'string' ? clampText(field[key], 120) : field[key];
    }
    return summary;
};

const summarizeFieldUpdates = (updates = {}) => Object.fromEntries(
    FORM_AI_FIELD_KEYS
        .filter(key => Object.prototype.hasOwnProperty.call(updates, key))
        .map(key => {
            const value = updates[key];
            if (key === 'choices' && Array.isArray(value)) {
                return [key, value.slice(0, 8).map(choice => clampText(choice, 80))];
            }
            if (typeof value === 'string') return [key, clampText(value, 120)];
            return [key, value];
        })
);

const summarizePatch = (patch = {}) => {
    if (patch.op === 'add') return { patchId: patch.patchId, op: patch.op, field: summarizeField(patch.field) };
    if (patch.op === 'update') return {
        patchId: patch.patchId,
        op: patch.op,
        id: patch.id,
        updates: summarizeFieldUpdates(patch.updates)
    };
    if (patch.op === 'remove') return { patchId: patch.patchId, op: patch.op, id: patch.id, label: clampText(patch.label, 120) };
    if (patch.op === 'update_meta') return {
        patchId: patch.patchId,
        op: patch.op,
        updates: {
            title: clampText(patch.updates?.title, 160),
            description: clampText(patch.updates?.description, 300)
        }
    };
    if (patch.op === 'update_settings') return {
        patchId: patch.patchId,
        op: patch.op,
        updates: Object.fromEntries(FORM_SETTINGS_KEYS
            .filter(key => Object.prototype.hasOwnProperty.call(patch.updates || {}, key))
            .map(key => [key, patch.updates[key]]))
    };
    if (patch.op === 'update_memory') return {
        patchId: patch.patchId,
        op: patch.op,
        memory: patch.updates?.memory ? { summary: clampText(patch.updates.memory.summary, FORM_AI_MEMORY_LIMIT) } : null
    };
    return { patchId: patch.patchId, op: patch.op };
};

export const buildVerifierContext = ({ requirements = [], patches = [], memoryUpdate = { action: 'none' }, cardinality = null }) => [
    'Planner Requirements:',
    JSON.stringify(requirements.map(requirement => ({
        id: requirement.id,
        description: clampText(requirement.description, 300)
    }))),
    '',
    'Planner-approved Memory Update:',
    JSON.stringify(memoryUpdate),
    'Treat this approved memory update as in scope. Do not flag it as an unrelated change.',
    '',
    'Question Cardinality:',
    cardinality
        ? JSON.stringify(cardinality)
        : '(no explicit question count requested)',
    'For total_questions, pass only when the final active question count equals targetCount. For add_questions, pass only when exactly additionalCount new questions were added.',
    '',
    'Generated Patches:',
    JSON.stringify(patches.map(summarizePatch))
].join('\n');

export const buildVerifierRepairContext = ({
    requirements = [],
    patches = [],
    memoryUpdate = { action: 'none' },
    cardinality = null,
    response,
    issues
}) => [
    'Repair the verifier response below.',
    'Return a complete replacement verifier response as JSON only.',
    'Do not change the generated patches or planner requirements.',
    '',
    buildVerifierContext({ requirements, patches, memoryUpdate, cardinality }),
    '',
    'Validation Issues:',
    clampText(issues, 2000),
    '',
    'Invalid Verifier Response:',
    clampText(response, 2000)
].join('\n');

export const buildWorkerRepairContext = ({ schema, requirements = [], response, issues, cardinality = null }) => [
    'Repair the worker proposal below.',
    'Return a complete replacement proposal as JSON only.',
    'Preserve the planner requirements and current form. Correct every listed issue.',
    '',
    'Current Form Schema:',
    JSON.stringify(compactFormSchema(schema)),
    '',
    'Existing Field IDs (these are the only valid targets for update/remove):',
    JSON.stringify((Array.isArray(schema.fields) ? schema.fields : []).map(field => field.id).filter(Boolean)),
    'The form ID is not a field ID. Never use it as a patch id. If a requested field is not listed, use an add patch instead of update/remove.',
    'Repair every listed issue. Every add patch must include a complete field object with non-empty id, type, and label. Do not repeat an omitted label.',
    'Question Cardinality:',
    cardinality
        ? JSON.stringify(cardinality)
        : '(no explicit question count requested)',
    'Cardinality is a hard requirement. For total_questions, make the final active question count equal targetCount. For add_questions, add exactly additionalCount new questions. Preserve valid patches and correct only the count mismatch.',
    'For update patches, include only properties explicitly requested. To change requiredness, use only { "required": true } or { "required": false }; never include label, type, choices, or other preserved properties unless they are explicitly being changed. Never clear an existing label.',
    '',
    'Planner Requirements:',
    JSON.stringify(requirements),
    '',
    'Validation Issues:',
    clampText(issues, 6000),
    '',
    'Invalid Worker Proposal:',
    clampText(response, FORM_AI_CONTEXT_LIMIT)
].join('\n');

export const getMemoryUpdate = (plannerResult = {}) => {
    const requestedUpdate = plannerResult.memoryUpdate;

    if (requestedUpdate?.action === 'clear') {
        return { action: 'clear' };
    }

    if (requestedUpdate?.action === 'replace') {
        const summary = clampText(requestedUpdate.summary, FORM_AI_MEMORY_LIMIT);
        return isEmptyFormMemorySummary(summary) ? { action: 'none' } : { action: 'replace', summary };
    }

    // Keep compatibility with the previous planner response shape.
    if (typeof plannerResult.aiMemory === 'string' && plannerResult.aiMemory.trim()) {
        const summary = clampText(plannerResult.aiMemory, FORM_AI_MEMORY_LIMIT);
        return isEmptyFormMemorySummary(summary) ? { action: 'none' } : { action: 'replace', summary };
    }

    return { action: 'none' };
};

export const createMemoryPatch = (schema, plannerResult) => {
    const update = getMemoryUpdate(plannerResult);
    if (update.action === 'none') return null;

    const currentMemory = readFormMemory(schema);
    if (update.action === 'clear' && !currentMemory) return null;
    if (update.action === 'replace' && currentMemory?.summary === update.summary) return null;

    return {
        op: 'update_memory',
        updates: update.action === 'clear'
            ? { memory: null }
            : { memory: { version: 1, summary: update.summary } },
        originalMemory: currentMemory
    };
};
