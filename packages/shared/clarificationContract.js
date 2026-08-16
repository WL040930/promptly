const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => String(value ?? '').trim();

const choiceInputTypes = new Set([
    'single_choice',
    'multiple_choice',
    'resource_choice',
    'resource_picker',
    'workflow_choice',
    'form_choice'
]);

const isUsableClarificationInput = input => {
    if (!isRecord(input) || !text(input.id) || !text(input.type)) return false;
    if (!choiceInputTypes.has(input.type)) return true;
    if (input.type === 'resource_picker' && input.allowCustom === true) return true;
    return Array.isArray(input.options) && input.options.length > 0;
};

const isFormTargetQuestion = question => {
    const value = text(question).toLocaleLowerCase();
    return value.includes('form') && (
        ['trigger', 'start', 'submit', 'response', 'receive'].some(word => value.includes(word))
        || /(?:which|choose|select|name|id).{0,24}form/.test(value)
    );
};

/**
 * Keep clarification cards actionable even when an upstream model or an old
 * persisted message omitted its input contract. Resource choices with no
 * options are not a usable contract either, so they receive the same safe
 * free-text fallback.
 */
export const clarificationInputsOrFallback = ({ inputs = [], question = '', fallback = true } = {}) => {
    const usableInputs = (Array.isArray(inputs) ? inputs : []).filter(isUsableClarificationInput);
    if (usableInputs.length > 0 || !fallback) return usableInputs;

    const formTarget = isFormTargetQuestion(question);
    return [{
        id: formTarget ? 'formId' : 'clarificationAnswer',
        type: 'text',
        label: formTarget ? 'Form name or ID' : 'Your answer',
        placeholder: formTarget ? 'Enter a form name or ID…' : 'Type your answer…',
        required: true
    }];
};

const optionId = option => isRecord(option)
    ? text(option.id ?? option.value)
    : text(option);

const optionLabel = option => isRecord(option)
    ? text(option.name ?? option.title ?? option.label ?? option.id ?? option.value)
    : text(option);

const normalizedValue = (input, value) => {
    if (['text', 'textarea'].includes(input?.type)) return text(value);
    if (input?.type === 'multiple_choice') {
        return [...new Set((Array.isArray(value) ? value : [value]).map(text).filter(Boolean))];
    }
    if (input?.type === 'single_choice') {
        const selected = [...new Set((Array.isArray(value) ? value : [value]).map(text).filter(Boolean))];
        return selected.slice(0, 1);
    }
    if (['resource_choice', 'resource_picker', 'workflow_choice', 'form_choice'].includes(input?.type)) {
        return text(isRecord(value) ? value.id ?? value.value : value);
    }
    if (Array.isArray(value)) return value.map(text).filter(Boolean);
    return text(value);
};

const hasValue = value => Array.isArray(value) ? value.length > 0 : text(value).length > 0;

const validChoice = (input, value) => {
    if (!['single_choice', 'multiple_choice', 'resource_choice', 'resource_picker', 'workflow_choice', 'form_choice'].includes(input?.type)) return true;
    if (input?.type === 'resource_picker' && input.allowCustom === true) return true;
    const allowed = new Set((input.options || []).map(optionId).filter(Boolean));
    const selected = Array.isArray(value) ? value : [value];
    return selected.length > 0 && selected.every(item => allowed.has(text(item)));
};

const displayAnswer = (input, value) => {
    const selected = Array.isArray(value) ? value : [value];
    if (['single_choice', 'multiple_choice', 'resource_choice', 'resource_picker', 'workflow_choice', 'form_choice'].includes(input?.type)) {
        const options = new Map((input.options || []).map(option => [optionId(option), optionLabel(option)]));
        return selected.map(item => options.get(text(item)) || text(item)).filter(Boolean).join(', ');
    }
    return selected.map(text).filter(Boolean).join(', ');
};

/**
 * Owns clarification completeness, normalization, and receipt labels. Callers
 * submit a declared input contract plus draft state and receive one verdict.
 */
export const resolveClarificationSubmission = ({ inputs = [], state = {} } = {}) => {
    const declaredInputs = Array.isArray(inputs) ? inputs.filter(input => input?.id) : [];
    const sourceState = isRecord(state) ? state : {};
    const normalizedState = {};
    const invalidInputIds = [];

    for (const input of declaredInputs) {
        const value = normalizedValue(input, sourceState[input.id]);
        if (!hasValue(value)) continue;
        if (!validChoice(input, value)) {
            invalidInputIds.push(input.id);
            continue;
        }
        normalizedState[input.id] = value;
    }

    const groups = new Map();
    for (const input of declaredInputs) {
        if (!input.alternativeGroup) continue;
        const key = text(input.alternativeGroup);
        if (!key) continue;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(input);
    }

    const groupedIds = new Set([...groups.values()].flat().map(input => input.id));
    const missingInputIds = declaredInputs
        .filter(input => !groupedIds.has(input.id) && input.required !== false && !hasValue(normalizedState[input.id]))
        .map(input => input.id);
    const missingGroups = [];
    const conflictingGroups = [];
    for (const [group, members] of groups) {
        const answered = members.filter(input => hasValue(normalizedState[input.id]));
        if (answered.length > 1) conflictingGroups.push(group);
        if (answered.length === 0 && members.some(input => input.required !== false)) missingGroups.push(group);
    }

    const answers = declaredInputs.flatMap(input => {
        const value = normalizedState[input.id];
        if (!hasValue(value)) return [];
        return [{
            id: input.id,
            label: text(input.label) || 'Answer',
            answer: displayAnswer(input, value)
        }];
    });

    return {
        complete: missingInputIds.length === 0
            && missingGroups.length === 0
            && conflictingGroups.length === 0
            && invalidInputIds.length === 0,
        state: normalizedState,
        answers,
        missingInputIds,
        missingGroups,
        conflictingGroups,
        invalidInputIds,
        decisionCount: declaredInputs.filter(input => !groupedIds.has(input.id)).length + groups.size
    };
};

export const updateClarificationDraft = ({ inputs = [], state = {}, inputId, value } = {}) => {
    const next = { ...(isRecord(state) ? state : {}) };
    const input = (inputs || []).find(candidate => candidate?.id === inputId);
    if (input?.alternativeGroup) {
        for (const peer of inputs || []) {
            if (peer?.id !== inputId && peer?.alternativeGroup === input.alternativeGroup) delete next[peer.id];
        }
    }
    const isTextInput = ['text', 'textarea'].includes(input?.type);
    // Keep the browser's raw draft while the user is typing. Submission
    // still uses normalizedValue(), so leading/trailing whitespace is not
    // persisted as an answer, but it must remain editable in the field.
    const draftValue = isTextInput
        ? (typeof value === 'string' ? value : String(value ?? ''))
        : normalizedValue(input || {}, value);
    const hasDraftValue = isTextInput ? draftValue.length > 0 : hasValue(draftValue);
    if (hasDraftValue) next[inputId] = draftValue;
    else delete next[inputId];
    return next;
};
