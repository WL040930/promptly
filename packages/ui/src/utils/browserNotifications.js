import { navigate } from './router.js';

export const AI_TURN_NOTIFICATION_EVENT = 'promptly:ai-turn-notification';
export const AI_TURN_NOTIFICATION_STORAGE_KEY = 'promptly.ai-turn-notifications.v1';
export const AI_TURN_NOTIFICATION_SEEN_KEY = 'promptly.ai-turn-notifications.seen.v1';
export const AI_TURN_NOTIFICATION_PREFERENCE_KEY = 'promptly.browser-notifications.enabled';

const MAX_STORED_TURNS = 80;
const MAX_SEEN_REQUESTS = 120;

const getStorage = type => {
    if (typeof window === 'undefined') return null;
    try {
        return window[type] || null;
    } catch {
        return null;
    }
};

const readJson = (storage, key, fallback) => {
    if (!storage) return fallback;
    try {
        const value = JSON.parse(storage.getItem(key) || 'null');
        return value ?? fallback;
    } catch {
        return fallback;
    }
};

const writeJson = (storage, key, value) => {
    if (!storage) return false;
    try {
        storage.setItem(key, JSON.stringify(value));
        return true;
    } catch {
        return false;
    }
};

const nowIso = () => new Date().toISOString();

export const isBrowserNotificationSupported = (target = globalThis) => Boolean(
    target && typeof target.Notification !== 'undefined'
);

export const getBrowserNotificationPermission = (target = globalThis) => {
    if (!isBrowserNotificationSupported(target)) return 'unsupported';
    return target.Notification.permission || 'default';
};

export const getBrowserNotificationPreference = (storage = getStorage('localStorage')) => {
    if (!storage) return false;
    try {
        return storage.getItem(AI_TURN_NOTIFICATION_PREFERENCE_KEY) === 'true';
    } catch {
        return false;
    }
};

export const setBrowserNotificationPreference = (enabled, storage = getStorage('localStorage')) => {
    if (!storage) return;
    try {
        if (enabled) storage.setItem(AI_TURN_NOTIFICATION_PREFERENCE_KEY, 'true');
        else storage.removeItem(AI_TURN_NOTIFICATION_PREFERENCE_KEY);
    } catch {
        // Browser storage is best effort; permission remains the authority.
    }
};

export const readPendingAITurns = (storage = getStorage('sessionStorage')) => {
    const value = readJson(storage, AI_TURN_NOTIFICATION_STORAGE_KEY, []);
    return Array.isArray(value) ? value : [];
};

export const writePendingAITurns = (turns, storage = getStorage('sessionStorage')) => {
    const normalized = Array.isArray(turns) ? turns.slice(-MAX_STORED_TURNS) : [];
    writeJson(storage, AI_TURN_NOTIFICATION_STORAGE_KEY, normalized);
    return normalized;
};

export const readSeenAITurns = (storage = getStorage('sessionStorage')) => {
    const value = readJson(storage, AI_TURN_NOTIFICATION_SEEN_KEY, []);
    return Array.isArray(value) ? value : [];
};

export const markAITurnSeen = (requestId, storage = getStorage('sessionStorage')) => {
    if (!requestId) return;
    const next = [...readSeenAITurns(storage).filter(id => id !== requestId), requestId].slice(-MAX_SEEN_REQUESTS);
    writeJson(storage, AI_TURN_NOTIFICATION_SEEN_KEY, next);
};

export const hasAITurnBeenSeen = (requestId, storage = getStorage('sessionStorage')) => (
    Boolean(requestId) && readSeenAITurns(storage).includes(requestId)
);

export const removePendingAITurn = (requestId, storage = getStorage('sessionStorage')) => {
    if (!requestId) return readPendingAITurns(storage);
    return writePendingAITurns(readPendingAITurns(storage).filter(turn => turn.requestId !== requestId), storage);
};

export const upsertPendingAITurn = (turn, storage = getStorage('sessionStorage')) => {
    if (!turn?.requestId) return readPendingAITurns(storage);
    const existing = readPendingAITurns(storage).find(item => item.requestId === turn.requestId) || {};
    const nextTurn = {
        ...existing,
        ...turn,
        requestId: String(turn.requestId),
        updatedAt: turn.updatedAt || nowIso(),
        startedAt: turn.startedAt || existing.startedAt || nowIso()
    };
    const next = [
        ...readPendingAITurns(storage).filter(item => item.requestId !== nextTurn.requestId),
        nextTurn
    ];
    return writePendingAITurns(next, storage);
};

export const emitAITurnLifecycle = (detail, target = globalThis.window) => {
    if (!target || typeof target.dispatchEvent !== 'function') return false;
    const event = typeof target.CustomEvent === 'function'
        ? new target.CustomEvent(AI_TURN_NOTIFICATION_EVENT, { detail })
        : { type: AI_TURN_NOTIFICATION_EVENT, detail };
    target.dispatchEvent(event);
    return true;
};

export const subscribeToAITurnLifecycle = (handler, target = globalThis.window) => {
    if (!target || typeof target.addEventListener !== 'function' || typeof handler !== 'function') return () => {};
    const listener = event => handler(event?.detail || event);
    target.addEventListener(AI_TURN_NOTIFICATION_EVENT, listener);
    return () => target.removeEventListener(AI_TURN_NOTIFICATION_EVENT, listener);
};

export const routeForAITurn = turn => {
    if (turn?.path) return turn.path;
    if (turn?.surface === 'form' && turn.resourceId) return `/app/forms/${encodeURIComponent(turn.resourceId)}/build`;
    if (turn?.surface === 'workflow' && turn.resourceId) return `/app/automations/${encodeURIComponent(turn.resourceId)}/build?editor=ai`;
    if (turn?.surface === 'ask_promptly' && turn.sessionId) return `/app/assistant/${encodeURIComponent(turn.sessionId)}`;
    return '/app/home';
};

export const notificationCopyForAITurn = turn => {
    const resource = turn?.resourceName || (
        turn?.surface === 'form' ? 'Your form' : turn?.surface === 'workflow' ? 'Your workflow' : 'Ask Promptly'
    );
    switch (turn?.outcome) {
        case 'clarification':
            return { title: 'Promptly needs your input', body: `${resource} is waiting for an answer.` };
        case 'proposal':
            return { title: 'Changes ready to review', body: `${resource} has changes ready for your review.` };
        case 'error':
            return { title: 'Promptly could not finish', body: `Open ${resource} to review what happened.` };
        default:
            return { title: 'Promptly finished', body: `${resource} is ready.` };
    }
};

// ---------------------------------------------------------------------------
// Service-worker registration for reliable notification display.
// Chrome on macOS silently swallows `new Notification()` in many scenarios.
// Using ServiceWorkerRegistration.showNotification() fixes this.
// ---------------------------------------------------------------------------

let swRegistrationPromise = null;

export const registerNotificationServiceWorker = () => {
    if (swRegistrationPromise) return swRegistrationPromise;
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
        swRegistrationPromise = Promise.resolve(null);
        return swRegistrationPromise;
    }
    swRegistrationPromise = navigator.serviceWorker
        .register('/notification-sw.js', { scope: '/' })
        .then(reg => {
            // Wait for the SW to be active before returning the registration.
            if (reg.active) return reg;
            const installing = reg.installing || reg.waiting;
            if (!installing) return reg;
            return new Promise(resolve => {
                installing.addEventListener('statechange', function handler() {
                    if (installing.state === 'activated' || installing.state === 'active') {
                        installing.removeEventListener('statechange', handler);
                        resolve(reg);
                    }
                });
            });
        })
        .catch(() => null);
    return swRegistrationPromise;
};

export const getNotificationServiceWorker = () => swRegistrationPromise || Promise.resolve(null);

// ---------------------------------------------------------------------------
// Show a browser notification, preferring the service-worker path.
// ---------------------------------------------------------------------------

export const showBrowserNotification = (turn, target = globalThis) => {
    if (!isBrowserNotificationSupported(target) || getBrowserNotificationPermission(target) !== 'granted') return null;
    const copy = notificationCopyForAITurn(turn);
    const options = {
        body: copy.body,
        icon: '/logo.png',
        // Test alerts need to remain visible long enough to verify. Real
        // AI outcomes keep the quieter, deduplicated default behavior.
        ...(turn?.test ? { requireInteraction: true, renotify: true } : { renotify: false }),
        tag: `promptly-ai:${turn.requestId}`,
        data: { path: routeForAITurn(turn), requestId: turn.requestId }
    };

    // Try the service-worker path first (reliable on Chrome/macOS).
    const swPromise = getNotificationServiceWorker();
    swPromise.then(reg => {
        if (reg) {
            reg.showNotification(copy.title, options).catch(() => {
                // SW notification failed — fall through to legacy constructor.
                showLegacyNotification(copy.title, options, turn, target);
            });
        } else {
            showLegacyNotification(copy.title, options, turn, target);
        }
    }).catch(() => {
        showLegacyNotification(copy.title, options, turn, target);
    });

    // Return a truthy sentinel so callers know the attempt was made.
    // The actual Notification object is created asynchronously via the SW.
    return { title: copy.title, tag: options.tag };
};

const showLegacyNotification = (title, options, turn, target) => {
    let notification;
    try {
        notification = new target.Notification(title, options);
    } catch {
        return null;
    }
    notification.onclick = () => {
        try { target.focus?.(); } catch { /* Window focus can be blocked by the browser. */ }
        const path = notification.data?.path || routeForAITurn(turn);
        if (target.location?.pathname !== path) navigate(path);
        notification.close?.();
    };
    return notification;
};

export const clearPendingAITurnNotifications = (storage = getStorage('sessionStorage')) => {
    writePendingAITurns([], storage);
    writeJson(storage, AI_TURN_NOTIFICATION_SEEN_KEY, []);
};

export const browserNotificationInternals = {
    getStorage,
    readJson,
    writeJson,
    MAX_STORED_TURNS,
    MAX_SEEN_REQUESTS
};
