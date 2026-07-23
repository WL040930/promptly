/**
 * Canonical application router.
 *
 * The product has one authenticated workspace. AI and visual editing are
 * presentation choices inside an automation, never separate application
 * modes.
 */

const AUTHENTICATED_PREFIX = '/app';

export function navigate(path) {
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
}

export function replacePath(path) {
    window.history.replaceState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
}

export function getPathname(path = window.location.pathname) {
    const source = String(path).includes('://') ? path : `http://promptly.local${path}`;
    return new URL(source).pathname;
}

export function getQuery(path = window.location.href) {
    const source = String(path).includes('://') ? path : `http://promptly.local${path}`;
    return new URL(source).searchParams;
}

export function isAppRoute(pathname) {
    return getPathname(pathname).startsWith(AUTHENTICATED_PREFIX);
}

export function getDashboardPath() {
    return '/app/home';
}

export function getRouteState(path = window.location.pathname) {
    const pathname = getPathname(path);
    return {
        pathname,
        isLogin: pathname === '/login',
        isRegister: pathname === '/register',
        isForgotPassword: pathname === '/forgot-password',
        isResetPassword: pathname.startsWith('/reset-password/'),
        isPublicForm: pathname.startsWith('/f/'),
        isDashboard: isAppRoute(pathname),
        isOnboarding: pathname === '/onboarding',
        isSecurity: pathname === '/landing/security' || pathname === '/security'
    };
}

const makeRoute = (page, extra = {}) => ({ page, ...extra });

export function parsePath(path = window.location.pathname) {
    const pathname = getPathname(path);
    const parts = pathname.replace(/^\//, '').split('/');

    if (parts[0] !== 'app') return makeRoute('home');

    switch (parts[1]) {
        case undefined:
        case 'home':
            return makeRoute('home');
        case 'automations':
            if (parts[2] === 'new') {
                return makeRoute('automation-new', { method: getQuery(path).get('method') || 'ai' });
            }
            if (parts[2]) {
                if (parts[3] === 'build') {
                    const editor = getQuery(path).get('editor') === 'visual' ? 'visual' : 'ai';
                    return makeRoute('automation-build', { automationId: parts[2], editor });
                }
                if (parts[3] === 'runs') return makeRoute('automation-runs', { automationId: parts[2] });
                if (parts[3] === 'versions') return makeRoute('automation-versions', { automationId: parts[2] });
                if (parts[3] === 'settings') return makeRoute('automation-settings', { automationId: parts[2] });
                return makeRoute('automation-detail', { automationId: parts[2] });
            }
            return makeRoute('automations');
        case 'assistant':
            return makeRoute('assistant', { conversationId: parts[2] || null });
        case 'forms':
            if (parts[2]) return makeRoute('form-detail', { formId: parts[2], section: parts[3] || 'build' });
            return makeRoute('forms');
        case 'runs':
            return makeRoute(parts[2] ? 'run-detail' : 'runs', { runId: parts[2] || null });
        case 'approvals':
            return makeRoute('approvals');
        case 'settings':
            return makeRoute('settings', { section: parts[2] || 'general' });
        default:
            return makeRoute('home');
    }
}

export function buildPath(route = {}) {
    switch (route.page) {
        case 'home': return '/app/home';
        case 'automations': return '/app/automations';
        case 'automation-new': return `/app/automations/new?method=${encodeURIComponent(route.method || 'ai')}`;
        case 'automation-detail': return `/app/automations/${route.automationId}`;
        case 'automation-build': {
            const editor = route.editor === 'visual' ? 'visual' : 'ai';
            return `/app/automations/${route.automationId}/build?editor=${editor}`;
        }
        case 'automation-runs': return `/app/automations/${route.automationId}/runs`;
        case 'automation-versions': return `/app/automations/${route.automationId}/versions`;
        case 'automation-settings': return `/app/automations/${route.automationId}/settings`;
        case 'assistant': return route.conversationId ? `/app/assistant/${route.conversationId}` : '/app/assistant';
        case 'forms': return '/app/forms';
        case 'form-detail': return `/app/forms/${route.formId}/${route.section || 'build'}`;
        case 'runs': return '/app/runs';
        case 'approvals': return '/app/approvals';
        case 'run-detail': return `/app/runs/${route.runId}`;
        case 'settings': return `/app/settings/${route.section || 'general'}`;
        case 'onboarding': return '/onboarding';
        default: return '/app/home';
    }
}

export function navigateTo(route) {
    navigate(buildPath(route));
}
