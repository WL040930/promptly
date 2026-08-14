import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { getChatSession, getFormChatHistory, getWorkflowAIChat } from '../api/backend.js';
import {
    getBrowserNotificationPermission,
    getBrowserNotificationPreference,
    hasAITurnBeenSeen,
    isBrowserNotificationSupported,
    markAITurnSeen,
    readPendingAITurns,
    removePendingAITurn,
    routeForAITurn,
    showBrowserNotification,
    subscribeToAITurnLifecycle,
    setBrowserNotificationPreference,
    upsertPendingAITurn
} from '../utils/browserNotifications.js';

const POLL_INTERVAL_MS = 5_000;
const MAX_PENDING_AGE_MS = 24 * 60 * 60 * 1000;

const BrowserNotificationContext = createContext(null);

const stateForSurface = async turn => {
    if (turn?.surface === 'form' && turn.resourceId) {
        const result = await getFormChatHistory(turn.resourceId, 1);
        return result?.state || null;
    }
    if (turn?.surface === 'workflow' && turn.resourceId) {
        const result = await getWorkflowAIChat(turn.resourceId, 1);
        return result?.state || null;
    }
    if (turn?.surface === 'ask_promptly' && turn.sessionId) {
        const result = await getChatSession(turn.sessionId);
        return result?.agentState || null;
    }
    return null;
};

const terminalFromState = (turn, state) => {
    const lastTurn = state?.lastTurn;
    if (!lastTurn || lastTurn.requestId !== turn.requestId || lastTurn.status === 'processing') return null;
    return {
        ...turn,
        outcome: lastTurn.outcome || (lastTurn.status === 'failed' ? 'error' : 'reply'),
        status: lastTurn.status,
        messageId: lastTurn.messageId || null,
        completedAt: lastTurn.completedAt || new Date().toISOString()
    };
};

const isExpired = turn => {
    const startedAt = new Date(turn?.startedAt || turn?.updatedAt || 0).getTime();
    return !Number.isFinite(startedAt) || Date.now() - startedAt > MAX_PENDING_AGE_MS;
};

export const BrowserNotificationProvider = ({ children }) => {
    const supported = isBrowserNotificationSupported();
    const [permission, setPermission] = useState(() => getBrowserNotificationPermission());
    const [enabled, setEnabled] = useState(() => (
        getBrowserNotificationPreference() && getBrowserNotificationPermission() === 'granted'
    ));
    const enabledRef = useRef(enabled);
    const pendingRef = useRef(readPendingAITurns());

    useEffect(() => {
        enabledRef.current = enabled;
    }, [enabled]);

    useEffect(() => {
        const refreshPermission = () => {
            const next = getBrowserNotificationPermission();
            setPermission(next);
            if (next !== 'granted' && enabledRef.current) {
                enabledRef.current = false;
                setBrowserNotificationPreference(false);
                setEnabled(false);
            }
        };
        window.addEventListener('focus', refreshPermission);
        document.addEventListener('visibilitychange', refreshPermission);
        return () => {
            window.removeEventListener('focus', refreshPermission);
            document.removeEventListener('visibilitychange', refreshPermission);
        };
    }, []);

    const notifyTerminal = useCallback(turn => {
        if (!turn?.requestId) return;
        pendingRef.current = removePendingAITurn(turn.requestId);
        if (hasAITurnBeenSeen(turn.requestId)) return;
        // Mark even when disabled so enabling notifications later does not
        // unexpectedly replay an old completion from before opt-in.
        markAITurnSeen(turn.requestId);
        if (!enabledRef.current || getBrowserNotificationPermission() !== 'granted') return;
        showBrowserNotification({ ...turn, path: routeForAITurn(turn) });
    }, []);

    const reconcile = useCallback(async () => {
        const pending = pendingRef.current;
        for (const turn of pending) {
            if (isExpired(turn)) {
                pendingRef.current = removePendingAITurn(turn.requestId);
                continue;
            }
            try {
                const state = await stateForSurface(turn);
                const terminal = terminalFromState(turn, state);
                if (terminal) notifyTerminal(terminal);
            } catch (error) {
                // A deleted resource or a temporary network failure should not
                // break monitoring for the remaining AI turns.
                if (error?.status === 404 || error?.response?.status === 404) {
                    pendingRef.current = removePendingAITurn(turn.requestId);
                }
            }
        }
    }, [notifyTerminal]);

    useEffect(() => {
        const unsubscribe = subscribeToAITurnLifecycle(detail => {
            if (!detail?.requestId) return;
            if (detail.type === 'started' || detail.type === 'bound' || detail.type === 'detached') {
                pendingRef.current = upsertPendingAITurn(detail);
                return;
            }
            if (detail.type === 'completed' || detail.type === 'failed') {
                notifyTerminal(detail);
            }
        });
        void reconcile();
        const interval = window.setInterval(() => { void reconcile(); }, POLL_INTERVAL_MS);
        return () => {
            unsubscribe();
            window.clearInterval(interval);
        };
    }, [notifyTerminal, reconcile]);

    const requestPermission = useCallback(async () => {
        if (!supported) return 'unsupported';
        let next;
        try {
            next = await window.Notification.requestPermission();
        } catch {
            next = getBrowserNotificationPermission();
        }
        next ||= getBrowserNotificationPermission();
        setPermission(next);
        if (next === 'granted') {
            setBrowserNotificationPreference(true);
            setEnabled(true);
        } else {
            setBrowserNotificationPreference(false);
            setEnabled(false);
        }
        return next;
    }, [supported]);

    const updateEnabled = useCallback(async nextEnabled => {
        if (!nextEnabled) {
            setBrowserNotificationPreference(false);
            setEnabled(false);
            return false;
        }
        if (!supported) return false;
        if (getBrowserNotificationPermission() === 'granted') {
            setBrowserNotificationPreference(true);
            setEnabled(true);
            setPermission('granted');
            return true;
        }
        const nextPermission = await requestPermission();
        return nextPermission === 'granted';
    }, [requestPermission, supported]);

    const sendTestNotification = useCallback(() => {
        // Use the latest rendered permission state here. A ref is useful for
        // long-lived lifecycle listeners, but it can lag one render behind a
        // just-granted permission when the user immediately sends a test.
        if (!enabled || getBrowserNotificationPermission() !== 'granted') return false;
        const requestId = `test_${Date.now()}`;
        const notification = showBrowserNotification({
            requestId,
            surface: 'ask_promptly',
            resourceName: 'Promptly',
            outcome: 'reply',
            test: true,
            path: window.location.pathname + window.location.search
        });
        return Boolean(notification);
    }, [enabled]);

    const value = useMemo(() => ({
        enabled,
        permission,
        supported,
        setEnabled: updateEnabled,
        requestPermission,
        sendTestNotification
    }), [enabled, permission, requestPermission, sendTestNotification, supported, updateEnabled]);

    return <BrowserNotificationContext.Provider value={value}>{children}</BrowserNotificationContext.Provider>;
};

export const useBrowserNotifications = () => {
    const context = useContext(BrowserNotificationContext);
    if (!context) throw new Error('useBrowserNotifications must be used within a BrowserNotificationProvider');
    return context;
};

export const browserNotificationContextInternals = {
    POLL_INTERVAL_MS,
    MAX_PENDING_AGE_MS,
    stateForSurface,
    terminalFromState,
    isExpired
};
