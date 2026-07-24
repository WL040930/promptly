import { generateWorkflowTurn } from './workflow/pipeline/pipeline.js';

export const normalizeWorkflowAIResult = result => {
    if (result?.type === 'reply') return { ...result, kind: 'reply' };
    if (result?.type === 'message') return { ...result, kind: 'clarification' };
    if (result?.type === 'proposal') return { ...result, kind: 'proposal' };
    return { ...result, kind: 'unknown' };
};

/**
 * Persistence-free Workflow AI seam. It interprets one turn and returns a
 * reply, clarification, or safe proposal. Applying a proposal remains a
 * separate explicit operation owned by workflowAssistant.
 */
export const runWorkflowTurn = async options => normalizeWorkflowAIResult(
    await generateWorkflowTurn(options)
);

