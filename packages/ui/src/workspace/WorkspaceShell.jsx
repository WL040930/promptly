import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { navigateTo } from '../utils/router.js';
import { apiRequest } from '../api/client.js';
import SettingsModal from '../dashboard/SettingsModal.jsx';
import Button from '../components/ui/Button.jsx';

const PanelLeftIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <line x1="9" y1="3" x2="9" y2="21" />
    </svg>
);

const icons = {
    home: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 10 9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M9 22V12h6v10" /></svg>,
    automations: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /><path d="M10 6.5h2a2 2 0 0 1 2 2v5" /><path d="M14 17.5h-2a2 2 0 0 1-2-2v-5" /></svg>,
    forms: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="9" y1="21" x2="9" y2="9" /></svg>,
    runs: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" /></svg>,
    approvals: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 4 4L19 6" /><path d="M4 4h16v16H4z" /></svg>,
    assistant: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /><path d="M8 8h8M8 12h5" /></svg>,
    settings: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1.51 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 8 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 3.6 15H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9.18l-.06-.06A2 2 0 1 1 7.37 6.3l.06.06A1.65 1.65 0 0 0 9.25 6.7H9.5A1.65 1.65 0 0 0 11 5.18V5a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 20.4 11H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" /></svg>
};

const navigation = [
    { page: 'home', label: 'Home', icon: icons.home },
    { page: 'automations', label: 'Automations', icon: icons.automations },
    { page: 'forms', label: 'Forms', icon: icons.forms },
    { page: 'runs', label: 'Runs', icon: icons.runs },
    { page: 'approvals', label: 'Approvals', icon: icons.approvals }
];

const pageForRoute = route => {
    if (route.page === 'automation-detail' || route.page.startsWith('automation-')) return 'automations';
    if (route.page === 'form-detail') return 'forms';
    if (route.page === 'run-detail') return 'runs';
    if (route.page === 'assistant') return 'assistant';
    return route.page;
};

export default function WorkspaceShell({ user, route, onLogout, children }) {
    const [collapsed, setCollapsed] = useState(() => window.localStorage.getItem('promptly.sidebar.collapsed') === 'true');
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [settingsTab, setSettingsTab] = useState('general');
    const activePage = route ? pageForRoute(route) : 'home';
    const approvalSummaryQuery = useQuery({
        queryKey: ['approval-summary'],
        queryFn: () => apiRequest('/api/continuations/approvals/summary'),
        refetchInterval: 10000,
        refetchOnWindowFocus: true
    });
    const pendingApprovalCount = Number(approvalSummaryQuery.data?.pendingCount || 0);

    useEffect(() => {
        if (route?.page === 'settings') {
            setSettingsTab(route.section || 'general');
            setSettingsOpen(true);
        }
    }, [route?.page, route?.section]);

    const go = (page) => {
        if (page === 'home') navigateTo({ page: 'home' });
        else if (page === 'automations') navigateTo({ page: 'automations' });
        else if (page === 'forms') navigateTo({ page: 'forms' });
        else if (page === 'runs') navigateTo({ page: 'runs' });
        else if (page === 'approvals') navigateTo({ page: 'approvals' });
        else if (page === 'assistant') navigateTo({ page: 'assistant' });
    };

    const toggleCollapsed = () => {
        setCollapsed(value => {
            const next = !value;
            window.localStorage.setItem('promptly.sidebar.collapsed', String(next));
            return next;
        });
    };

    const content = React.isValidElement(children)
        ? React.cloneElement(children, {
            isSidebarCollapsed: collapsed,
            setSidebarCollapsed: setCollapsed
        })
        : children;

    return (
        <div className="workspace-shell flex h-screen overflow-hidden bg-[#f5f6fb] font-sans text-[#171827]">
            <aside className={`workspace-sidebar relative z-50 flex shrink-0 flex-col text-white transition-all duration-300 ${collapsed ? 'is-collapsed w-[70px]' : 'w-[252px]'}`}>
                <div className={`workspace-sidebar-head flex h-16 items-center ${collapsed ? 'justify-center' : 'justify-between px-4'}`}>
                    {!collapsed && <div className="workspace-brand flex items-center gap-2.5"><img src="/logo.png" alt="Promptly" className="h-8 w-8 rounded-[10px] ring-1 ring-white/15" /><span className="font-display text-lg font-bold tracking-tight text-white">Promptly<span>.</span></span></div>}
                    <Button variant="ghost" size="icon-md" onClick={toggleCollapsed} className="p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"><PanelLeftIcon /></Button>
                </div>

                <div className="workspace-sidebar-body flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4">
                    <Button variant="primary" onClick={() => navigateTo({ page: 'automation-new', method: 'ai' })} className={`workspace-new-button mb-5 rounded-xl shadow-none ${collapsed ? 'mx-auto h-10 w-10 p-0' : 'w-full'}`} title="Create automation">
                        <span className="text-xl leading-none">+</span>{!collapsed && <span className="ml-2">New automation</span>}
                    </Button>

                    <div className="mb-1 px-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">{!collapsed && 'Workspace'}</div>
                    {navigation.map(item => (
                        <button key={item.page} type="button" onClick={() => go(item.page)} title={item.label} aria-label={item.page === 'approvals' && pendingApprovalCount > 0 ? `${item.label}, ${pendingApprovalCount} pending` : item.label} className={`workspace-nav-item group relative flex items-center gap-3 rounded-xl border p-2.5 text-left font-semibold transition-colors ${activePage === item.page ? 'is-active border-white/10 bg-white text-[#5143cc] shadow-sm' : 'border-transparent text-slate-400 hover:bg-white/10 hover:text-white'} ${collapsed ? 'justify-center' : ''}`}>
                            {activePage === item.page && <span className="absolute -left-3 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-[#c8f17b]" />}
                            <span className="shrink-0">{item.icon}</span>{!collapsed && <span className="truncate">{item.label}</span>}
                            {item.page === 'approvals' && pendingApprovalCount > 0 && <span className={`${collapsed ? 'absolute right-1.5 top-1.5 h-2.5 w-2.5' : 'ml-auto min-w-5 px-1.5'} flex items-center justify-center rounded-full bg-amber-400 text-[10px] font-bold leading-5 text-[#171827]`}>{!collapsed && pendingApprovalCount > 99 ? '99+' : !collapsed ? pendingApprovalCount : null}</span>}
                        </button>
                    ))}

                    <button type="button" onClick={() => go('assistant')} title="Ask Promptly" className={`workspace-assistant-link mt-2 flex items-center gap-3 rounded-xl border border-transparent p-2.5 text-left font-semibold transition-colors hover:bg-[#2a2840] hover:text-white ${collapsed ? 'justify-center' : ''}`}>
                        <span className="shrink-0">{icons.assistant}</span>{!collapsed && <span>Ask Promptly</span>}
                    </button>

                    <div className="mt-auto pt-6">
                        <button type="button" onClick={() => { setSettingsTab('general'); setSettingsOpen(true); }} title="Settings" className={`workspace-settings-link flex w-full items-center gap-3 rounded-xl border border-transparent p-2.5 text-left font-medium transition-colors hover:bg-white/10 hover:text-white ${collapsed ? 'justify-center' : ''}`}>
                            <span className="shrink-0">{icons.settings}</span>{!collapsed && <span>Settings</span>}
                        </button>
                    </div>
                </div>

                <div className={`workspace-user flex items-center gap-3 p-3 ${collapsed ? 'justify-center' : ''}`}>
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#c8f17b] text-xs font-bold text-[#171827]">{user?.email?.substring(0, 2).toUpperCase() || 'U'}</div>
                    {!collapsed && <div className="min-w-0"><p className="truncate text-sm font-bold text-white">{user?.email || 'User'}</p><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Promptly account</p></div>}
                </div>
            </aside>

            <main className="workspace-main flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[#f5f6fb]">{content}</main>

            {settingsOpen && <SettingsModal user={user} onClose={() => setSettingsOpen(false)} onLogout={onLogout} initialTab={settingsTab} />}
        </div>
    );
}
