/**
 * The small, shared vocabulary used by the UI notification coordinator and
 * the durable assistant state writers. Keeping this mapping in shared code
 * prevents a new proposal/clarification message kind from silently becoming
 * an ordinary completion in one surface.
 */
export const ASSISTANT_TURN_OUTCOMES = Object.freeze({
    REPLY: 'reply',
    CLARIFICATION: 'clarification',
    PROPOSAL: 'proposal',
    ERROR: 'error'
});

export const ASSISTANT_PROPOSAL_KINDS = Object.freeze([
    'agent_plan_review',
    'form_proposal',
    'workflow_proposal',
    'workflow_diff',
    'solution_proposal',
    'form_duplicate_proposal',
    'form_delete_proposal',
    'form_bulk_delete_proposal',
    'form_response_clear_proposal'
]);

const proposalKinds = new Set(ASSISTANT_PROPOSAL_KINDS);

export const outcomeForAssistantMessage = ({ kind, status, isError = false, outcome = null } = {}) => {
    if (Object.values(ASSISTANT_TURN_OUTCOMES).includes(outcome)) return outcome;
    if (isError || status === 'failed' || status === 'error' || kind === 'error') {
        return ASSISTANT_TURN_OUTCOMES.ERROR;
    }
    if (kind === 'clarification' || kind === 'agent_clarification') {
        return ASSISTANT_TURN_OUTCOMES.CLARIFICATION;
    }
    if (proposalKinds.has(kind)) return ASSISTANT_TURN_OUTCOMES.PROPOSAL;
    return ASSISTANT_TURN_OUTCOMES.REPLY;
};

export const assistantTurnNotificationInternals = { proposalKinds };
