import { QueryTypes } from 'sequelize';

export const TRIGGER_EVENT_CLAIM_SQL = `
    WITH candidate AS (
        SELECT id
        FROM "trigger_events"
        WHERE status = 'pending'
          AND "availableAt" <= NOW()
        ORDER BY "availableAt" ASC, "createdAt" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
    )
    UPDATE "trigger_events" AS event
    SET status = 'processing',
        "lockedAt" = NOW(),
        attempts = event.attempts + 1,
        "updatedAt" = NOW()
    FROM candidate
    WHERE event.id = candidate.id
    RETURNING event.*;
`;

export const WAIT_CONTINUATION_CLAIM_SQL = `
    WITH candidate AS (
        SELECT id
        FROM "workflow_continuations"
        WHERE kind = 'wait'
          AND status = 'pending'
          AND "availableAt" <= NOW()
        ORDER BY "availableAt" ASC, "createdAt" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
    )
    UPDATE "workflow_continuations" AS continuation
    SET status = 'resuming',
        "updatedAt" = NOW()
    FROM candidate
    WHERE continuation.id = candidate.id
    RETURNING continuation.*;
`;

export const claimQueueRow = async ({ model, query }) => {
    const [row] = await model.sequelize.query(query, { type: QueryTypes.SELECT });
    return row ? model.build(row, { isNewRecord: false }) : null;
};
