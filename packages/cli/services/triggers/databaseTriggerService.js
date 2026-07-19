import DatabaseChangeEvent from '../../models/triggers/DatabaseChangeEvent.js';
import TriggerSubscription from '../../models/triggers/TriggerSubscription.js';
import { ingestEvent } from './triggerRuntime.js';
import { matchesDatabaseSubscription } from './triggerContracts.js';

const WATCHED_TABLES = [
    ['forms', 'forms'],
    ['automations', 'automations'],
    ['automation_runs', 'automationRuns']
];

let publisherTimer = null;

export const ensureDatabaseChangeTriggers = async sequelize => {
    await sequelize.query(`
        CREATE OR REPLACE FUNCTION promptly_record_database_change()
        RETURNS trigger AS $trigger$
        DECLARE
            new_data jsonb;
            old_data jsonb;
            event_id text;
            user_id uuid;
            record_id text;
            changed_fields jsonb;
        BEGIN
            new_data := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END;
            old_data := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END;
            user_id := NULLIF(coalesce(new_data, old_data)->>'userId', '')::uuid;
            record_id := coalesce(new_data->>'id', old_data->>'id');
            event_id := 'db_evt_' || md5(clock_timestamp()::text || random()::text || txid_current()::text);
            changed_fields := CASE
                WHEN TG_OP <> 'UPDATE' THEN '[]'::jsonb
                ELSE (
                    SELECT coalesce(jsonb_agg(entry.key ORDER BY entry.key), '[]'::jsonb)
                    FROM jsonb_each(coalesce(new_data, '{}'::jsonb)) AS entry
                    WHERE entry.key <> 'updatedAt'
                      AND entry.value IS DISTINCT FROM old_data -> entry.key
                )
            END;

            INSERT INTO database_change_events
                (id, "userId", resource, "recordId", "eventType", "beforeData", "afterData", "changedFields", "createdAt", "updatedAt")
            VALUES
                (event_id, user_id, TG_ARGV[0], record_id, lower(TG_OP), old_data, new_data, changed_fields, NOW(), NOW());

            PERFORM pg_notify('promptly_database_changes', event_id);
            IF TG_OP = 'DELETE' THEN
                RETURN OLD;
            END IF;
            RETURN NEW;
        END;
        $trigger$ LANGUAGE plpgsql;
    `);

    for (const [tableName, resource] of WATCHED_TABLES) {
        const triggerName = `promptly_${tableName.replace(/[^a-z0-9]/gi, '_')}_change`;
        await sequelize.query(`DROP TRIGGER IF EXISTS "${triggerName}" ON "${tableName}"`);
        await sequelize.query(`
            CREATE TRIGGER "${triggerName}"
            AFTER INSERT OR UPDATE OR DELETE ON "${tableName}"
            FOR EACH ROW EXECUTE FUNCTION promptly_record_database_change('${resource}')
        `);
    }
};

const publishOneChange = async change => {
    const subscriptions = await TriggerSubscription.findAll({
        where: { provider: 'database', userId: change.userId, status: 'active' }
    });
    for (const subscription of subscriptions) {
        if (!matchesDatabaseSubscription({
            config: subscription.config,
            change: { ...change.toJSON(), subscriptionWorkflowId: subscription.workflowId }
        })) continue;
        await ingestEvent({
            provider: 'database',
            eventType: `record.${change.eventType}`,
            externalEventId: change.id,
            payload: {
                occurredAt: change.createdAt,
                data: {
                    resource: change.resource,
                    recordId: change.recordId,
                    eventType: change.eventType,
                    before: change.beforeData,
                    after: change.afterData,
                    changedFields: change.changedFields
                }
            },
            subscriptionId: subscription.id,
            causationId: change.id
        });
    }
};

const publishPendingDatabaseChanges = async ({ limit = 100 } = {}) => {
    const changes = await DatabaseChangeEvent.findAll({
        where: { publishedAt: null },
        order: [['createdAt', 'ASC']],
        limit
    });
    for (const change of changes) {
        try {
            await publishOneChange(change);
            await change.update({ publishedAt: new Date() });
        } catch (error) {
            console.error(`[DatabaseTrigger] Failed to publish ${change.id}:`, error.message);
        }
    }
    return changes.length;
};

export const startDatabaseChangePublisher = () => {
    if (publisherTimer) return;
    publisherTimer = setInterval(() => publishPendingDatabaseChanges().catch(error => {
        console.error('[DatabaseTrigger] Publisher failed:', error.message);
    }), 1000);
};
