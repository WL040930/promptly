import React, { useState, useEffect, useCallback, useRef } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { clearAuthToken, clearAuthUser } from '../utils/storage.js';
import { apiRequest } from '../api/client.js';
import { useToast } from '../components/ToastContext.jsx';
import SettingsModal from './SettingsModal.jsx';
import Button from '../components/Button.jsx';
import { DashboardIcon, WorkflowIcon, LogsIcon } from '../chat/components/Icons';
import { navigate, parsePath, buildPath } from '../utils/router.js';

// Icons
const PanelLeftIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
        <line x1="9" y1="3" x2="9" y2="21"></line>
    </svg>
);

const MessageSquareIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
    </svg>
);

const SettingsIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3"></circle>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
    </svg>
);

const RECENT_CHATS_PREVIEW = [
    "Drafting Follow-up Email",
    "Sync Notion with Google Sheets",
    "Slack Notification Setup"
];

const DashboardShell = ({ user, onUserUpdate, onLogout, children }) => {
    const isChatMode = user?.experienceLevel === 'chat';
    const [isCollapsed, setIsCollapsed] = useState(() => {
        return window.location.pathname.includes('/builder/');
    });
    const [isCreating, setIsCreating] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [settingsInitialTab, setSettingsInitialTab] = useState('general');
    const [hoveredTab, setHoveredTab] = useState(null);
    const container = useRef(null);
    const toast = useToast();

    useGSAP(() => {
        gsap.from('.dashboard-sidebar', {
            x: -50,
            opacity: 0,
            duration: 0.6,
            ease: 'power3.out'
        });
    }, { scope: container });

    // ── URL-driven active tab ────────────────────────────────────────────────
    const getTabFromUrl = useCallback(() => {
        const parsed = parsePath(window.location.pathname);
        if (isChatMode) {
            // Chat mode: tab is the chat sub-page
            return parsed.tab || 'dashboard';
        }
        // Workflow mode: map to sidebar tab ids
        if (parsed.tab === 'workflows') return 'workflows';
        return parsed.tab || 'dashboard';
    }, [isChatMode]);

    const [activeTab, setActiveTabState] = useState(getTabFromUrl);

    // Sync tab when the user uses the browser back/forward buttons
    useEffect(() => {
        const handler = () => setActiveTabState(getTabFromUrl());
        window.addEventListener('popstate', handler);
        return () => window.removeEventListener('popstate', handler);
    }, [getTabFromUrl]);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        if (params.get('settings') !== 'connections') {
            return;
        }

        setSettingsInitialTab('connections');
        setIsSettingsOpen(true);

        if (params.get('success') === 'true') {
            toast.success('Google account connected successfully.');
        } else {
            const errorCode = params.get('error');
            if (errorCode === 'missing_code_or_state') {
                toast.error('Google OAuth did not return the required callback state.');
            } else if (errorCode === 'user_not_found') {
                toast.error('Could not match the Google callback to your account.');
            } else if (errorCode === 'oauth_failed') {
                toast.error('Google OAuth failed. Please try again.');
            }
        }

        window.history.replaceState({}, '', window.location.pathname);
    }, [toast]);

    // Navigate and update tab — used by sidebar buttons
    const setActiveTab = useCallback((tab) => {
        const mode = isChatMode ? 'chat' : 'workflow';
        const url = buildPath({ mode, tab });
        navigate(url);
        setActiveTabState(tab);
    }, [isChatMode]);

    // ── Handlers ─────────────────────────────────────────────────────────────

    const handleLogout = () => {
        clearAuthToken();
        clearAuthUser();
        if (onLogout) onLogout();
    };

    const handleSwitchRole = async (newRole) => {
        try {
            const data = await apiRequest('/api/auth/mode', {
                method: 'PUT',
                body: JSON.stringify({ experienceLevel: newRole })
            });
            if (onUserUpdate && data?.user) {
                onUserUpdate(data.user);
                
                // Navigate to the correct base URL for the new role
                const newUrl = newRole === 'chat' ? '/chat/dashboard' : '/workflow/dashboard';
                navigate(newUrl);
                setActiveTabState('dashboard');
            }
        } catch (err) {
            console.error('Failed to update experience level:', err);
            toast.error('Failed to save settings. Please try again.');
        }
    };


    return (
        <div ref={container} className="flex h-screen bg-[#f7f9fc] text-slate-900 font-sans overflow-hidden">
            
            {/* Global Sidebar */}
            <aside className={`dashboard-sidebar bg-slate-50 border-r border-slate-200 flex flex-col transition-all duration-300 relative z-20 shrink-0 ${isCollapsed ? 'w-[70px]' : 'w-[260px]'}`}>
                
                {/* Brand & Toggle */}
                <div className={`h-16 flex items-center ${isCollapsed ? 'justify-center' : 'justify-between px-4'} border-b border-transparent`}>
                    {!isCollapsed && (
                        <div className="flex items-center gap-2 overflow-hidden">
                            <img 
                                src="/logo.png" 
                                alt="Promptly Logo" 
                                className="w-8 h-8 rounded-lg overflow-hidden object-contain shadow-sm shrink-0" 
                            />
                            <span className="text-lg font-bold tracking-tight bg-gradient-to-r from-indigo-600 to-cyan-400 bg-clip-text text-transparent truncate">
                                Promptly
                            </span>
                        </div>
                    )}
                    <Button 
                        variant="ghost"
                        size="icon-md"
                        onClick={() => setIsCollapsed(!isCollapsed)}
                        className="p-1.5 shrink-0"
                    >
                        <PanelLeftIcon />
                    </Button>
                </div>

                {/* Navigation Items */}
                <div className="flex-1 overflow-y-visible py-4 flex flex-col gap-1 px-3">
                    
                    {/* Primary Action Button */}
                    <div className="mb-4 px-1">
                        <Button 
                            variant="primary"
                            onClick={() => {
                                if (isCreating) return;
                                setIsCreating(true);
                                setActiveTab(isChatMode ? 'chat' : 'workflows');
                                window.dispatchEvent(new CustomEvent(isChatMode ? 'create-chat' : 'create-workflow', {
                                    detail: { onComplete: () => setIsCreating(false) }
                                }));
                            }}
                            disabled={isCreating}
                            isLoading={isCreating}
                            loadingText={!isCollapsed ? <span className="whitespace-nowrap">Creating...</span> : ""}
                            className={`rounded-xl shadow-md shadow-indigo-500/20 hover:shadow-lg hover:shadow-indigo-500/30 hover:-translate-y-0.5 transition-all bg-gradient-to-r from-indigo-600 to-indigo-600 ${isCollapsed ? 'w-10 h-10 mx-auto p-0 shrink-0' : 'w-full py-2.5'}`}
                            title={isChatMode ? 'Create Chat' : 'Create Workflow'}
                            iconLeft={!isCreating && (
                                <svg className="shrink-0 transition-all duration-300" width={isCollapsed ? "24" : "18"} height={isCollapsed ? "24" : "18"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="12" y1="5" x2="12" y2="19"></line>
                                    <line x1="5" y1="12" x2="19" y2="12"></line>
                                </svg>
                            )}
                        >
                            {!isCollapsed && <span className="whitespace-nowrap">{isChatMode ? 'Create Chat' : 'Create Workflow'}</span>}
                        </Button>
                    </div>

                    {/* Chat Mode Navigation */}
                    {isChatMode && (
                        <>
                            <div className="px-2 mb-1 mt-2 text-xs font-bold uppercase tracking-wider text-slate-400 opacity-80 whitespace-nowrap overflow-hidden">
                                {!isCollapsed && 'Chat Workspace'}
                            </div>

                            {[
                                { id: 'dashboard', label: 'Dashboard', icon: DashboardIcon },
                                { id: 'chat', label: 'Chat', icon: MessageSquareIcon },
                                { id: 'workflow', label: 'Workflows', icon: WorkflowIcon },
                                { id: 'forms', label: 'Forms', icon: () => (
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                                        <line x1="3" y1="9" x2="21" y2="9"></line>
                                        <line x1="9" y1="21" x2="9" y2="9"></line>
                                    </svg>
                                ) },
                                { id: 'logs', label: 'Logs', icon: LogsIcon }
                            ].map(item => (
                                <div 
                                    key={item.id}
                                    className="relative"
                                    onMouseEnter={() => setHoveredTab(item.id)}
                                    onMouseLeave={() => setHoveredTab(null)}
                                >
                                    <button 
                                        onClick={() => setActiveTab(item.id)}
                                        className={`flex items-center gap-3 w-full p-2.5 rounded-xl font-semibold transition-colors ${
                                            activeTab === item.id 
                                                ? 'bg-white border border-slate-200 text-indigo-600 shadow-sm' 
                                                : 'text-slate-600 hover:bg-slate-100 border border-transparent'
                                        }`}
                                    >
                                        <span className="shrink-0"><item.icon /></span>
                                        {!isCollapsed && <span className="truncate">{item.label}</span>}
                                    </button>


                                </div>
                            ))}
                            
                            <div className="mt-auto pt-6 flex flex-col gap-1">
                                <button onClick={() => {
                                    setSettingsInitialTab('general');
                                    setIsSettingsOpen(true);
                                }} className="flex items-center gap-3 w-full p-2.5 rounded-xl text-slate-600 hover:bg-slate-100 font-medium transition-colors border border-transparent">
                                    <span className="shrink-0"><SettingsIcon /></span>
                                    {!isCollapsed && <span className="truncate">Settings</span>}
                                </button>
                            </div>
                        </>
                    )}

                    {/* Workflow Navigation */}
                    {!isChatMode && (
                        <>
                            <div className="px-2 mb-1 mt-2 text-xs font-bold uppercase tracking-wider text-slate-400 opacity-80 whitespace-nowrap overflow-hidden">
                                {!isCollapsed && 'Workflow Workspace'}
                            </div>

                            {[
                                { id: 'dashboard', label: 'Dashboard', icon: DashboardIcon },
                                { id: 'workflows', label: 'Workflows', icon: WorkflowIcon },
                                { id: 'forms', label: 'Forms', icon: () => (
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                                        <line x1="3" y1="9" x2="21" y2="9"></line>
                                        <line x1="9" y1="21" x2="9" y2="9"></line>
                                    </svg>
                                ) },
                                { id: 'logs', label: 'Logs', icon: LogsIcon }
                            ].map(item => (
                                <button 
                                    key={item.id}
                                    onClick={() => setActiveTab(item.id)}
                                    className={`flex items-center gap-3 w-full p-2.5 rounded-xl font-semibold transition-colors ${
                                        activeTab === item.id 
                                            ? 'bg-white border border-slate-200 text-indigo-600 shadow-sm' 
                                            : 'text-slate-600 hover:bg-slate-100 border border-transparent'
                                    }`}
                                >
                                    <span className="shrink-0"><item.icon /></span>
                                    {!isCollapsed && <span className="truncate">{item.label}</span>}
                                </button>
                            ))}

                            <div className="mt-auto pt-6 flex flex-col gap-1">
                                <button onClick={() => {
                                    setSettingsInitialTab('general');
                                    setIsSettingsOpen(true);
                                }} className="flex items-center gap-3 w-full p-2.5 rounded-xl text-slate-600 hover:bg-slate-100 font-medium transition-colors">
                                    <span className="shrink-0"><SettingsIcon /></span>
                                    {!isCollapsed && <span className="truncate">Settings</span>}
                                </button>
                            </div>
                        </>
                    )}
                </div>

                {/* Bottom Settings / Profile */}
                <div className="p-3 border-t border-slate-200 flex flex-col gap-1">
                    
                    {/* User Profile */}
                    <div className={`flex items-center gap-3 w-full p-2 rounded-xl transition-colors text-slate-700 ${isCollapsed ? 'justify-center' : ''}`}>
                        <div className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-inner">
                            {user?.email ? user.email.substring(0,2).toUpperCase() : 'U'}
                        </div>
                        {!isCollapsed && (
                            <div className="flex flex-col items-start truncate flex-1">
                                <span className="text-sm font-bold truncate w-full">{user?.email || 'User'}</span>
                                <span className="text-[0.65rem] font-bold text-slate-500 uppercase tracking-wider">{user?.experienceLevel || 'Setup'} Mode</span>
                            </div>
                        )}
                    </div>
                </div>
            </aside>

            {/* Main Application Area */}
            <main className="dashboard-main flex-1 flex flex-col relative w-full h-full overflow-hidden bg-white">
                {React.Children.map(children, child => {
                    if (React.isValidElement(child)) {
                        return React.cloneElement(child, {
                            activeTab,
                            setActiveTab,
                            isSidebarCollapsed: isCollapsed,
                            setSidebarCollapsed: setIsCollapsed
                        });
                    }
                    return child;
                })}
            </main>
            
            {isSettingsOpen && (
                <SettingsModal 
                    user={user} 
                    onClose={() => setIsSettingsOpen(false)} 
                    onSwitchRole={handleSwitchRole} 
                    onLogout={handleLogout} 
                    initialTab={settingsInitialTab}
                />
            )}
        </div>
    );
};

export default DashboardShell;
