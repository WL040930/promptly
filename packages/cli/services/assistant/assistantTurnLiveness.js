import env from '../../config/env.js';

export const ASSISTANT_TURN_STALE_AFTER_MS = Math.max((env.aiTimeoutMs || 0) + 30_000, 120_000);

const timestamp = value => {
    const time = new Date(value || 0).getTime();
    return Number.isFinite(time) && time > 0 ? time : null;
};

export const assistantTurnLastActivityAt = state => (
    state?.inFlightLastActivityAt
    || state?.progress?.updatedAt
    || state?.inFlightStartedAt
    || null
);

/**
 * A stale turn has stopped producing durable progress long after the provider
 * deadline. Healthy long-running generations refresh `inFlightLastActivityAt`
 * through provider liveness events, so this never reduces model work.
 */
export const isAssistantTurnStale = (state, {
    now = Date.now(),
    staleAfterMs = ASSISTANT_TURN_STALE_AFTER_MS
} = {}) => {
    if (state?.phase !== 'processing') return false;
    if (!state?.inFlightRequestId) return true;
    const lastActivity = timestamp(assistantTurnLastActivityAt(state));
    return !lastActivity || now - lastActivity >= staleAfterMs;
};
