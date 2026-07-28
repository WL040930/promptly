const clampText = (value, limit) => String(value || '').trim().slice(0, limit);

const compactChoices = choices => Array.isArray(choices)
    ? choices.slice(0, 100).map(choice => clampText(choice, 255))
    : undefined;

/**
 * Safe, schema-only form context for AI consumers. This intentionally never
 * includes form responses or submission values.
 */
export const projectFormResourceContext = form => {
    if (!form) return null;
    const value = form.toJSON ? form.toJSON() : form;
    const fields = (value.fields || []).map(field => {
        const choices = compactChoices(field.choices);
        return {
            id: field.id,
            label: clampText(field.label || field.name, 255),
            type: field.type,
            required: field.required === true,
            ...(field.description ? { description: clampText(field.description, 500) } : {}),
            ...(choices ? { choices } : {})
        };
    });
    return {
        id: value.id,
        title: clampText(value.title, 255),
        description: clampText(value.description, 1000),
        updatedAt: value.updatedAt || null,
        respondentEmailFieldId: value.respondentEmailFieldId || value.settings?.respondentEmailFieldId || null,
        fields
    };
};

export const projectFormResourceSummary = form => {
    if (!form) return null;
    const value = form.toJSON ? form.toJSON() : form;
    return {
        id: value.id,
        title: clampText(value.title, 255),
        updatedAt: value.updatedAt || null
    };
};
