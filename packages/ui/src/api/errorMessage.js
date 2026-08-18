const issueMessage = issue => {
    if (!issue || typeof issue !== 'object') return '';
    const path = Array.isArray(issue.path) ? issue.path.join('.') : issue.path || issue.field;
    const detail = issue.message || issue.code;
    if (!detail) return '';
    return path ? `${path}: ${detail}` : detail;
};

export const formatApiErrorMessage = payload => {
    const base = typeof payload === 'string'
        ? payload
        : payload?.message || payload?.error || 'Request failed.';
    const details = Array.isArray(payload?.issues)
        ? payload.issues.map(issueMessage).filter(Boolean)
        : [];
    return details.length > 0 ? `${base} ${details.join(' ')}` : base;
};
