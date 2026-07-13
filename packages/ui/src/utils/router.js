/**
 * Minimal client-side router utility.
 * Wraps history.pushState so all navigation stays in one place.
 */

export function navigate(path) {
    window.history.pushState({}, '', path);
    // Dispatch a synthetic popstate so any listener (e.g. App.jsx) reacts.
    window.dispatchEvent(new PopStateEvent('popstate'));
}

/**
 * Parse the current pathname into its routing segments.
 * Returns an object understood by DashboardShell / WorkflowBuilderView.
 *
 * Workflow mode URL examples:
 *   /workflow/dashboard     → { mode:'workflow', tab:'dashboard' }
 *   /workflow/workflows     → { mode:'workflow', tab:'workflows', viewMode:'overview' }
 *   /workflow/builder/w2   → { mode:'workflow', tab:'workflows', viewMode:'builder', workflowId:'w2' }
 *   /workflow/forms        → { mode:'workflow', tab:'forms' }
 *   /workflow/logs         → { mode:'workflow', tab:'logs' }
 *
 * Chat mode URL examples:
 *   /chat/chat            → { mode:'chat', tab:'chat' }
 *   /chat/dashboard  → { mode:'chat', tab:'dashboard' }
 *   /chat/workflow   → { mode:'chat', tab:'workflow' }
 *   /chat/logs       → { mode:'chat', tab:'logs' }
 */
export function parsePath(pathname) {
    const parts = pathname.replace(/^\//, '').split('/');
    
    if (parts[0] === 'chat') {
        const chatTab = parts[1] || 'chat';
        const sessionId = parts[2] || null;
        return { mode: 'chat', tab: chatTab, sessionId };
    }

    // Default to workflow mode
    switch (parts[1]) {
        case 'workflows':
            return { mode: 'workflow', tab: 'workflows', viewMode: 'overview' };
        case 'builder':
            return { mode: 'workflow', tab: 'workflows', viewMode: 'builder', workflowId: parts[2] || null };
        case 'forms':
            return { mode: 'workflow', tab: 'forms', formId: parts[2] || null, subTab: parts[3] || null };
        case 'logs':
            return { mode: 'workflow', tab: 'logs' };
        case 'dashboard':
        default:
            return { mode: 'workflow', tab: 'dashboard' };
    }
}

/**
 * Produce a URL from the current routing state.
 */
export function buildPath({ mode, tab, viewMode, workflowId, formId, subTab, sessionId } = {}) {
    if (mode === 'chat') {
        if (!tab || tab === 'chat') return sessionId ? `/chat/chat/${sessionId}` : '/chat/chat';
        return `/chat/${tab}`;
    }

    // Workflow mode
    switch (tab) {
        case 'workflows':
            if (viewMode === 'builder' && workflowId) return `/workflow/builder/${workflowId}`;
            return '/workflow/workflows';
        case 'forms':
            if (formId && subTab) return `/workflow/forms/${formId}/${subTab}`;
            if (formId) return `/workflow/forms/${formId}`;
            return '/workflow/forms';
        case 'logs':
            return '/workflow/logs';
        case 'dashboard':
        default:
            return '/workflow/dashboard';
    }
}
