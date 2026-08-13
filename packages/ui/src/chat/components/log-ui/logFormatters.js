const dateFormatter = new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
});

export function getWorkflowName(log) {
    return log?.sourceAutomation?.name || log?.workflow?.name || log?.workflowNameSnapshot || 'Unknown workflow';
}

export function isDeletedAutomationRun(log) {
    return Boolean(log?.sourceAutomation?.deleted || log?.workflowDeletedAt);
}

export function formatLogDate(value) {
    if (!value) return 'Unknown time';

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Unknown time' : dateFormatter.format(date);
}

export function formatDuration(durationMs) {
    if (durationMs === null || durationMs === undefined) return 'N/A';
    if (durationMs < 1000) return `${durationMs}ms`;
    return `${(durationMs / 1000).toFixed(2)}s`;
}

const WAITING_STATUSES = new Set(['waiting', 'running', 'resuming', 'pending']);
const normalizeStatus = status => String(status || '').trim().toLowerCase();

export function isWaitingStatus(status) {
    return WAITING_STATUSES.has(normalizeStatus(status));
}

export function isSuccessStatus(status) {
    return ['success', 'succeeded'].includes(normalizeStatus(status));
}

export function isFailedStatus(status) {
    return normalizeStatus(status) === 'failed';
}

export function isCancelledStatus(status) {
    return normalizeStatus(status) === 'cancelled';
}

export function getStatusClasses(status) {
    if (isSuccessStatus(status)) {
        return {
            badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
            icon: 'text-emerald-600'
        };
    }

    if (isWaitingStatus(status)) {
        return {
            badge: 'bg-amber-50 text-amber-700 border-amber-200',
            icon: 'text-amber-600'
        };
    }

    if (isCancelledStatus(status)) {
        return {
            badge: 'bg-slate-100 text-slate-600 border-slate-200',
            icon: 'text-slate-500'
        };
    }

    if (!isFailedStatus(status)) {
        return {
            badge: 'bg-slate-100 text-slate-600 border-slate-200',
            icon: 'text-slate-500'
        };
    }

    return {
        badge: 'bg-red-50 text-red-700 border-red-200',
        icon: 'text-red-600'
    };
}
