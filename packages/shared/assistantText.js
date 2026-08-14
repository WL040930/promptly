const MIN_REPEAT_LENGTH = 24;

/**
 * Keep the user's wording intact while removing the specific accidental input
 * pattern produced by a duplicated composer update: one full command pasted
 * immediately after itself, optionally separated by whitespace.
 */
export const normalizeAssistantText = value => {
    const text = String(value || '').trim();
    if (text.length < MIN_REPEAT_LENGTH * 2) return text;
    const repeated = text.match(new RegExp(`^([\\s\\S]{${MIN_REPEAT_LENGTH},}?)\\s*\\1$`));
    return repeated ? repeated[1].trim() : text;
};
