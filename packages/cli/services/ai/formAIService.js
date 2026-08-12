import { generateFormFromPrompt } from './form/pipeline/pipeline.js';

/**
 * Shared Form AI interface.
 *
 * This module is deliberately the seam between form callers and the form AI
 * implementation. It never mutates a form or persists a message. Callers may
 * adapt the returned turn to SSE, chat, or agent artifacts, while proposal
 * acceptance remains a separate explicit operation.
 */
export const normalizeFormAIResult = (result = {}) => {
    if (result.type === 'reply') {
        return {
            ...result,
            kind: 'reply'
        };
    }

    if (result.type === 'message') {
        return {
            ...result,
            kind: 'clarification'
        };
    }

    if (result.type === 'proposal') {
        return {
            ...result,
            kind: 'proposal'
        };
    }

    return {
        ...result,
        kind: 'unknown'
    };
};

export const runFormTurn = async ({
    request,
    currentSchema = {},
    history = [],
    pendingProposal = null,
    clarificationMode,
    turnContext = null,
    resourceContext = null,
    onProgress = null,
    provider = null
} = {}) => normalizeFormAIResult(await generateFormFromPrompt(
    request,
    currentSchema,
    pendingProposal
        ? [
            ...history,
            {
                sender: 'bot',
                text: 'Pending proposal available for revision.',
                // The form context consumes persisted assistant-message shape.
                // Keep this adapter aligned with it instead of maintaining the
                // retired top-level `proposal` representation.
                kind: 'form_proposal',
                proposalStatus: 'pending',
                payload: pendingProposal
            }
        ]
        : history,
    onProgress,
    { clarificationMode, provider, turnContext, resourceContext, pendingProposal }
));
