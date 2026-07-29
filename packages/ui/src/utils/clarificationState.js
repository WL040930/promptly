const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export const clarificationState = value => isRecord(value) ? value : {};

export const choiceValues = value => {
    if (Array.isArray(value)) return value.filter(item => typeof item === 'string');
    return typeof value === 'string' && value.trim() ? [value] : [];
};

export const textValue = value => typeof value === 'string' ? value : '';

export const updateChoiceValue = (state, inputId, option, isSingle) => {
    const currentState = clarificationState(state);
    if (isSingle) return { ...currentState, [inputId]: [option] };

    const current = choiceValues(currentState[inputId]);
    return {
        ...currentState,
        [inputId]: current.includes(option)
            ? current.filter(value => value !== option)
            : [...current, option]
    };
};
