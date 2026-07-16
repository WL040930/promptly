export const FORM_AI_HISTORY_LIMIT = 12;
export const FORM_AI_MEMORY_LIMIT = 1500;
export const FORM_AI_CONTEXT_LIMIT = 12000;

const clampText = (value, limit) => String(value || '').trim().slice(0, limit);

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
    const { id, title, description, fields = [], settings = {} } = schema;
    const { aiMemory: _aiMemory, ...formSettings } = settings;

    return {
        ...(id ? { id } : {}),
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

export const buildPlannerContext = ({ schema, chatHistory = [], prompt }) => {
    const memory = readFormMemory(schema);
    const recentConversation = selectRecentMessages(chatHistory);

    return [
        'Persistent Form Memory:',
        memory?.summary || '(none)',
        '',
        'Current Form Schema:',
        JSON.stringify(compactFormSchema(schema)),
        '',
        'Recent Conversation:',
        recentConversation.length > 0 ? recentConversation.join('\n') : '(none)',
        '',
        'Current Request:',
        clampText(prompt, FORM_AI_CONTEXT_LIMIT)
    ].join('\n');
};

export const buildWorkerContext = ({ schema, instructions }) => [
    'Current Form Schema:',
    JSON.stringify(compactFormSchema(schema)),
    '',
    'Instructions from Planner:',
    clampText(instructions, FORM_AI_CONTEXT_LIMIT)
].join('\n');

export const getMemoryUpdate = (plannerResult = {}) => {
    const requestedUpdate = plannerResult.memoryUpdate;

    if (requestedUpdate?.action === 'clear') {
        return { action: 'clear' };
    }

    if (requestedUpdate?.action === 'replace') {
        const summary = clampText(requestedUpdate.summary, FORM_AI_MEMORY_LIMIT);
        return summary ? { action: 'replace', summary } : { action: 'clear' };
    }

    // Keep compatibility with the previous planner response shape.
    if (typeof plannerResult.aiMemory === 'string' && plannerResult.aiMemory.trim()) {
        return { action: 'replace', summary: clampText(plannerResult.aiMemory, FORM_AI_MEMORY_LIMIT) };
    }

    return { action: 'none' };
};

export const createMemoryPatch = (schema, plannerResult) => {
    const update = getMemoryUpdate(plannerResult);
    if (update.action === 'none') return null;

    return {
        op: 'update_memory',
        updates: update.action === 'clear'
            ? { memory: null }
            : { memory: { version: 1, summary: update.summary } },
        originalMemory: readFormMemory(schema)
    };
};
