import { FORM_AI_MEMORY_LIMIT as SHARED_FORM_AI_MEMORY_LIMIT } from '../../../shared/formContract.js';
import { getClarificationModeInstruction, normalizeClarificationMode } from '../../../shared/agentContract.js';

export const FORM_AI_HISTORY_LIMIT = 12;
export const FORM_AI_MEMORY_LIMIT = SHARED_FORM_AI_MEMORY_LIMIT;
export const FORM_AI_CONTEXT_LIMIT = 12000;

const clampText = (value, limit) => String(value || '').trim().slice(0, limit);
const EMPTY_MEMORY_SUMMARY = /^(?:none|no durable form(?:-specific)? rules? have been set|no persistent form(?:-specific)? rules? have been set|no form memory has been set)\.?$/i;

const isEmptyMemorySummary = summary => !summary || EMPTY_MEMORY_SUMMARY.test(summary.trim());

export const readFormMemory = (schema = {}) => {
    const storedMemory = schema.settings?.aiMemory;
    if (!storedMemory) return null;

    if (typeof storedMemory === 'string') {
        const summary = clampText(storedMemory, FORM_AI_MEMORY_LIMIT);
        return summary ? { version: 1, summary } : null;
    }

    if (typeof storedMemory === 'object' && storedMemory.summary) {
        const summary = clampText(storedMemory.summary, FORM_AI_MEMORY_LIMIT);
        return summary ? {
            version: storedMemory.version || 1,
            summary,
            ...(storedMemory.updatedAt ? { updatedAt: storedMemory.updatedAt } : {})
        } : null;
    }

    return null;
};

export const compactFormSchema = (schema = {}) => {
    const { title, description, fields = [], settings = {} } = schema;
    const { aiMemory: _aiMemory, ...formSettings } = settings;

    return {
        title: title || '',
        description: description || '',
        settings: formSettings,
        fields: Array.isArray(fields) ? fields : []
    };
};

const selectRecentMessages = (messages = []) => {
    const recentMessages = messages.slice(-FORM_AI_HISTORY_LIMIT);
    const selected = [];
    let totalCharacters = 0;

    for (let index = recentMessages.length - 1; index >= 0; index -= 1) {
        const message = recentMessages[index];
        const text = clampText(message.text, 2000);
        if (!text) continue;

        const line = `${message.sender === 'user' ? 'User' : 'Assistant'}: ${text}`;
        if (selected.length > 0 && totalCharacters + line.length > FORM_AI_CONTEXT_LIMIT) break;

        selected.unshift(line);
        totalCharacters += line.length;
    }

    return selected;
};

export const buildPlannerContext = ({ schema, chatHistory = [], prompt, clarificationMode }) => {
    const memory = readFormMemory(schema);
    const recentConversation = selectRecentMessages(chatHistory);

    return [
        'Persistent Form Memory:',
        memory?.summary || '(none)',
        '',
        'Current Form Schema:',
        JSON.stringify(compactFormSchema(schema)),
        '',
        'Clarification:',
        `${normalizeClarificationMode(clarificationMode)} - ${getClarificationModeInstruction(clarificationMode)}`,
        '',
        'Recent Conversation:',
        recentConversation.length > 0 ? recentConversation.join('\n') : '(none)',
        '',
        'Current Request:',
        clampText(prompt, FORM_AI_CONTEXT_LIMIT)
    ].join('\n');
};

export const buildWorkerContext = ({ schema, instructions, requirements = [] }) => [
    'Current Form Schema:',
    JSON.stringify(compactFormSchema(schema)),
    '',
    'Existing Field IDs (these are the only valid targets for update/remove):',
    JSON.stringify((Array.isArray(schema.fields) ? schema.fields : []).map(field => field.id).filter(Boolean)),
    'The form ID is not a field ID. Never use it as a patch id.',
    'Every add patch must include a complete field object with non-empty id, type, and label.',
    '',
    'Planner Requirements:',
    JSON.stringify(requirements),
    '',
    'Instructions from Planner:',
    clampText(instructions, FORM_AI_CONTEXT_LIMIT)
].join('\n');

export const buildPlannerRepairContext = ({ response, issues }) => [
    'Repair the planner response below.',
    'Return a complete replacement planner response as JSON only.',
    '',
    'Validation Issues:',
    clampText(issues, 6000),
    '',
    'Invalid Planner Response:',
    clampText(response, FORM_AI_CONTEXT_LIMIT)
].join('\n');

const summarizePatch = (patch) => {
    if (patch.op === 'add') return { patchId: patch.patchId, op: patch.op, field: patch.field };
    if (patch.op === 'update') return { patchId: patch.patchId, op: patch.op, id: patch.id, label: patch.label, updates: patch.updates };
    if (patch.op === 'remove') return { patchId: patch.patchId, op: patch.op, id: patch.id, label: patch.label };
    if (patch.op === 'update_meta') return { patchId: patch.patchId, op: patch.op, updates: patch.updates };
    if (patch.op === 'update_memory') return { patchId: patch.patchId, op: patch.op, memory: patch.updates?.memory || null };
    return patch;
};

export const buildVerifierContext = ({ requirements = [], patches = [], memoryUpdate = { action: 'none' } }) => [
    'Planner Requirements:',
    JSON.stringify(requirements),
    '',
    'Planner-approved Memory Update:',
    JSON.stringify(memoryUpdate),
    'Treat this approved memory update as in scope. Do not flag it as an unrelated change.',
    '',
    'Generated Patches:',
    JSON.stringify(patches.map(summarizePatch))
].join('\n');

export const buildWorkerRepairContext = ({ schema, requirements = [], response, issues }) => [
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
        return isEmptyMemorySummary(summary) ? { action: 'none' } : { action: 'replace', summary };
    }

    // Keep compatibility with the previous planner response shape.
    if (typeof plannerResult.aiMemory === 'string' && plannerResult.aiMemory.trim()) {
        const summary = clampText(plannerResult.aiMemory, FORM_AI_MEMORY_LIMIT);
        return isEmptyMemorySummary(summary) ? { action: 'none' } : { action: 'replace', summary };
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
