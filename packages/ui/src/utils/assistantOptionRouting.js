const EVENT_OPTIONS = new Set(['decide_for_me', 'submit_clarification']);

/**
 * Return only option values that must cross the assistant event boundary.
 * Keeping this separate from display/text options prevents structured
 * clarification actions from being reduced to an empty button label.
 */
export const eventForAssistantOption = option => EVENT_OPTIONS.has(option?.type) ? option : null;
