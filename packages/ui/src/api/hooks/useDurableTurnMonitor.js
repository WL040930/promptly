import { useEffect } from 'react';

const RECOVERY_POLL_INTERVAL_MS = 5_000;

/**
 * Refresh only when an SSE connection detached or a remounted screen discovers
 * a persisted active turn. Healthy streams receive server-sent progress and do
 * not poll at all.
 */
export const useDurableTurnMonitor = ({
    enabled,
    refetch,
    onSnapshot = null,
    intervalMs = RECOVERY_POLL_INTERVAL_MS
} = {}) => {
    useEffect(() => {
        if (!enabled || typeof refetch !== 'function') return undefined;
        let mounted = true;
        const refresh = () => {
            void refetch()
                .then(result => {
                    if (mounted) onSnapshot?.(result?.data);
                })
                .catch(() => {});
        };
        refresh();
        const interval = window.setInterval(refresh, intervalMs);
        return () => {
            mounted = false;
            window.clearInterval(interval);
        };
    }, [enabled, intervalMs, onSnapshot, refetch]);
};

export const durableTurnMonitorInternals = { RECOVERY_POLL_INTERVAL_MS };
