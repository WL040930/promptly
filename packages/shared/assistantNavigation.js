const explicitNavigation = text => /\b(open|show|view|go to|take me to|navigate to)\b/i.test(String(text || ''));

/**
 * Maps only explicit, allowlisted workspace navigation requests to route
 * descriptors. The model never emits URLs and callers can safely pass the
 * descriptor to the application's existing router.
 */
export const resolveAssistantNavigation = ({ message, context = {} } = {}) => {
    const text = String(message || '').toLowerCase();
    if (!explicitNavigation(text)) return null;

    if (/\b(connection|integration|gmail|google account)\b/.test(text)) return { page: 'settings', section: 'connections' };
    if (/\bapproval/.test(text)) return { page: 'approvals' };
    if (/\b(home|dashboard|overview)\b/.test(text)) return { page: 'home' };
    if (/\b(run|execution|log|failure|failed)\b/.test(text)) return { page: 'runs' };
    if (/\b(response|submission)\b/.test(text) && context.formId) return { page: 'form-detail', formId: context.formId, section: 'responses' };
    if (/\b(forms?|surveys?)\b/.test(text)) {
        return context.formId && /\b(this|selected|current)\b/.test(text)
            ? { page: 'form-detail', formId: context.formId, section: 'build' }
            : { page: 'forms' };
    }
    if (/\b(workflows?|automations?)\b/.test(text)) {
        return context.workflowId && /\b(this|selected|current)\b/.test(text)
            ? { page: 'automation-build', automationId: context.workflowId, editor: 'ai' }
            : { page: 'automations' };
    }
    if (/\b(setting|profile|security)\b/.test(text)) return { page: 'settings', section: 'general' };
    return null;
};
