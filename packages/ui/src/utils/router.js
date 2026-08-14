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
    const settingsTab = getQuery(path).get('settings') === 'connections' ? 'connections' : null;
    const route = (page, extra = {}) => makeRoute(page, {
        ...extra,
        ...(settingsTab ? { settingsTab } : {})
    });

    if (parts[0] !== 'app') return route('home');

    switch (parts[1]) {
        case undefined:
        case 'home':
            return route('home');
        case 'automations':
            if (parts[2] === 'new') {
                const method = getQuery(path).get('method') || 'ai';
                const prompt = getQuery(path).get('prompt');
                return route('automation-new', {
                    method,
                    ...(prompt ? { prompt } : {})
                });
            }
            if (parts[2]) {
                if (parts[3] === 'build') {
                    const editor = getQuery(path).get('editor') === 'visual' ? 'visual' : 'ai';
                    const prompt = getQuery(path).get('prompt');
                    return route('automation-build', {
                        automationId: parts[2],
                        editor,
                        ...(prompt ? { prompt } : {})
                    });
                }
                if (parts[3] === 'runs') return route('automation-runs', { automationId: parts[2] });
                if (parts[3] === 'versions') return route('automation-versions', { automationId: parts[2] });
                if (parts[3] === 'settings') return route('automation-settings', { automationId: parts[2] });
                return route('automation-detail', { automationId: parts[2] });
            }
            return route('automations');
        case 'assistant':
            return route('assistant', { conversationId: parts[2] || null });
        case 'forms':
            if (parts[2]) return route('form-detail', { formId: parts[2], section: parts[3] || 'build' });
            return route('forms');
        case 'runs':
            return route(parts[2] ? 'run-detail' : 'runs', { runId: parts[2] || null });
        case 'approvals':
            return route('approvals');
        case 'settings':
            return route('settings', { section: parts[2] || 'general' });
        default:
            return route('home');
    }
}

export function buildPath(route = {}) {
    switch (route.page) {
        case 'home': return '/app/home';
        case 'automations': return '/app/automations';
        case 'automation-new': {
            const params = new URLSearchParams({ method: route.method || 'ai' });
            if (route.prompt) params.set('prompt', route.prompt);
            return `/app/automations/new?${params.toString()}`;
        }
        case 'automation-detail': return `/app/automations/${route.automationId}`;
        case 'automation-build': {
            const params = new URLSearchParams({ editor: route.editor === 'visual' ? 'visual' : 'ai' });
            if (route.prompt) params.set('prompt', route.prompt);
            return `/app/automations/${route.automationId}/build?${params.toString()}`;
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

export function clearSettingsModalQuery() {
    const url = new URL(window.location.href);
    url.searchParams.delete('settings');
    url.searchParams.delete('success');
    url.searchParams.delete('error');
    const nextPath = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState({}, '', nextPath);
    window.dispatchEvent(new PopStateEvent('popstate'));
}
