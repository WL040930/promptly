/**
 * Stable transport contract shared by Ask Promptly and the resource assistants.
 * Heartbeats are transport-only: they must never make a stalled turn appear healthy.
 */
export const ASSISTANT_TURN_EVENTS = Object.freeze({
    STARTED: 'turn.started',
    ROUTED: 'turn.routed',
    PROGRESS: 'run.progress',
    MESSAGE_CREATED: 'message.created',
    CLARIFICATION_REQUIRED: 'clarification.required',
    APPROVAL_REQUIRED: 'approval.required',
    COMPLETED: 'turn.completed',
    FAILED: 'turn.failed',
    HEARTBEAT: 'turn.heartbeat'
});

const TERMINAL_EVENTS = new Set([
    ASSISTANT_TURN_EVENTS.COMPLETED,
    ASSISTANT_TURN_EVENTS.FAILED,
    'complete',
    'error'
]);

export const isTurnHeartbeat = event => event?.type === ASSISTANT_TURN_EVENTS.HEARTBEAT;

export const isMeaningfulTurnEvent = event => Boolean(
    event?.type
    && !isTurnHeartbeat(event)
    && (TERMINAL_EVENTS.has(event.type) || event.type !== 'heartbeat')
);

export const assistantTurnContract = { ASSISTANT_TURN_EVENTS, isTurnHeartbeat, isMeaningfulTurnEvent };
