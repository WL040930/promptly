const dateFormatter = new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
});

export function getWorkflowName(log) {
    return log.workflow?.name || 'Unknown workflow';
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

export function getStatusClasses(status) {
    if (status === 'Success') {
        return {
            badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
            icon: 'text-emerald-600'
        };
    }

    return {
        badge: 'bg-red-50 text-red-700 border-red-200',
        icon: 'text-red-600'
    };
}
