import test from 'node:test';
import assert from 'node:assert/strict';
import {
    AI_TURN_NOTIFICATION_PREFERENCE_KEY,
    hasAITurnBeenSeen,
    markAITurnSeen,
    notificationCopyForAITurn,
    readPendingAITurns,
    routeForAITurn,
    setBrowserNotificationPreference,
    showBrowserNotification,
    upsertPendingAITurn
} from './browserNotifications.js';

const storage = () => {
    const values = new Map();
    return {
        getItem: key => values.get(key) || null,
        setItem: (key, value) => values.set(key, String(value)),
        removeItem: key => values.delete(key)
    };
};

test('pending AI turns are upserted by request ID', () => {
    const sessionStorage = storage();
    upsertPendingAITurn({ requestId: 'req_1', surface: 'form', resourceId: 'form_1', startedAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }, sessionStorage);
    upsertPendingAITurn({ requestId: 'req_1', surface: 'form', resourceId: 'form_1', sessionId: 'unused', updatedAt: '2026-01-01T00:00:05.000Z' }, sessionStorage);
    assert.deepEqual(readPendingAITurns(sessionStorage), [{
        requestId: 'req_1',
        surface: 'form',
        resourceId: 'form_1',
        startedAt: '2026-01-01T00:00:00.000Z',
        sessionId: 'unused',
        updatedAt: '2026-01-01T00:00:05.000Z'
    }]);
});

test('seen request IDs provide terminal deduplication', () => {
    const sessionStorage = storage();
    assert.equal(hasAITurnBeenSeen('req_2', sessionStorage), false);
    markAITurnSeen('req_2', sessionStorage);
    assert.equal(hasAITurnBeenSeen('req_2', sessionStorage), true);
});

test('notification settings and destinations stay explicit and privacy-safe', () => {
    const localStorage = storage();
    setBrowserNotificationPreference(true, localStorage);
    assert.equal(localStorage.getItem(AI_TURN_NOTIFICATION_PREFERENCE_KEY), 'true');
    assert.equal(routeForAITurn({ surface: 'workflow', resourceId: 'wf/1' }), '/app/automations/wf%2F1/build?editor=ai');
    assert.deepEqual(notificationCopyForAITurn({ surface: 'form', resourceName: 'Event Registration', outcome: 'clarification' }), {
        title: 'Promptly needs your input',
        body: 'Event Registration is waiting for an answer.'
    });
});

test('a test notification returns a sentinel when permission is granted and null when not', () => {
    const target = {
        Notification: function Notification(title, options) {
            this.title = title;
            this.close = () => {};
        },
        focus() {},
        location: { pathname: '/app/home' }
    };
    target.Notification.permission = 'granted';

    const result = showBrowserNotification({
        requestId: 'test_1',
        surface: 'ask_promptly',
        resourceName: 'Promptly',
        outcome: 'reply',
        test: true
    }, target);

    // Returns a truthy sentinel with title and tag.
    assert.ok(result);
    assert.equal(result.title, 'Promptly finished');
    assert.equal(result.tag, 'promptly-ai:test_1');

    // When permission is not granted, returns null.
    const deniedTarget = {
        Notification: function Notification() { throw new TypeError('Notifications are unavailable'); }
    };
    deniedTarget.Notification.permission = 'denied';
    assert.equal(showBrowserNotification({ requestId: 'test_2' }, deniedTarget), null);
});

