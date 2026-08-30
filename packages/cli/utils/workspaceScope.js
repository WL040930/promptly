export const ONBOARDING_DEMO_KEY = 'onboarding-v3';

export const parseWorkspaceScope = value => String(value || '').trim().toLowerCase() === 'demo'
    ? 'demo'
    : 'live';

export const demoKeyForScope = scope => parseWorkspaceScope(scope) === 'demo'
    ? ONBOARDING_DEMO_KEY
    : null;

export const workspaceWhere = ({ userId, scope = 'live', extra = {} } = {}) => ({
    ...extra,
    userId,
    demoKey: demoKeyForScope(scope)
});

export const workspaceScopeFromRequest = req => parseWorkspaceScope(req?.query?.scope);

export const assertWritableWorkspaceRecord = record => {
    if (!record?.demoKey) return;
    const error = new Error('The sample workspace is read-only. Exit sample workspace to make changes.');
    error.status = 409;
    error.code = 'DEMO_WORKSPACE_READ_ONLY';
    throw error;
};

