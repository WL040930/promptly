import React, { useState } from 'react';
import { clearAuthToken, clearAuthUser } from '../utils/storage.js';
import { apiRequest } from '../api/client.js';
import SettingsModal from './SettingsModal';
import { DashboardIcon, WorkflowIcon, LogsIcon } from '../chat/components/Icons';

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

const BookIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
    </svg>
);

const SettingsIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3"></circle>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
    </svg>
);

const UserIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
        <circle cx="12" cy="7" r="4"></circle>
    </svg>
);

const LogOutIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
        <polyline points="16 17 21 12 16 7"></polyline>
        <line x1="21" y1="12" x2="9" y2="12"></line>
    </svg>
);

const TerminalIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="4 17 10 11 4 5"></polyline>
        <line x1="12" y1="19" x2="20" y2="19"></line>
    </svg>
);

const RECENT_CHATS_PREVIEW = [
    "Drafting Follow-up Email",
    "Sync Notion with Google Sheets",
    "Slack Notification Setup"
];

const DashboardShell = ({ user, onUserUpdate, onLogout, children }) => {
    const isChatMode = user?.experienceLevel === 'chat';
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [activeTab, setActiveTab] = useState(isChatMode ? 'chat' : 'dashboard');
    const [hoveredTab, setHoveredTab] = useState(null);



    const handleLogout = () => {
        clearAuthToken();
        clearAuthUser();
        if (onLogout) onLogout();
    };

    const handleSwitchRole = async (newRole) => {
        try {
            const data = await apiRequest('/api/auth/experience-level', {
                method: 'PUT',
                body: JSON.stringify({ experienceLevel: newRole })
            });
            if (onUserUpdate && data?.user) {
                onUserUpdate(data.user);
            }
        } catch (err) {
            console.error('Failed to update experience level:', err);
            alert('Failed to save settings. Please try again.');
        }
    };


    return (
        <div className="flex h-screen bg-[#f7f9fc] text-slate-900 font-sans overflow-hidden">
            
            {/* Global Sidebar */}
            <aside className={`bg-slate-50 border-r border-slate-200 flex flex-col transition-all duration-300 relative z-20 ${isCollapsed ? 'w-[70px]' : 'w-[260px]'}`}>
                
                {/* Brand & Toggle */}
                <div className={`h-16 flex items-center ${isCollapsed ? 'justify-center' : 'justify-between px-4'} border-b border-transparent`}>
                    {!isCollapsed && (
                        <div className="flex items-center gap-2 overflow-hidden">
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-cyan-400 grid place-items-center font-extrabold text-sm text-white shadow-sm shrink-0">
                                P
                            </div>
                            <span className="text-lg font-bold tracking-tight bg-gradient-to-r from-blue-600 to-cyan-400 bg-clip-text text-transparent truncate">
                                Promptly
                            </span>
                        </div>
                    )}
                    <button 
                        onClick={() => setIsCollapsed(!isCollapsed)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors shrink-0"
                    >
                        <PanelLeftIcon />
                    </button>
                </div>

                {/* Navigation Items */}
                <div className="flex-1 overflow-y-visible py-4 flex flex-col gap-1 px-3">
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
                                                ? 'bg-white border border-slate-200 text-blue-600 shadow-sm' 
                                                : 'text-slate-600 hover:bg-slate-100 border border-transparent'
                                        }`}
                                    >
                                        <span className="shrink-0"><item.icon /></span>
                                        {!isCollapsed && <span className="truncate">{item.label}</span>}
                                    </button>

                                    {/* Hover Popup for Chat History */}
                                    {item.id === 'chat' && hoveredTab === 'chat' && (
                                        <div className="absolute left-[calc(100%+12px)] top-0 w-[260px] bg-white rounded-2xl shadow-2xl border border-slate-100 p-4 z-50 animate-fade-in pointer-events-auto">
                                            <div className="absolute left-[-6px] top-4 w-3 h-3 bg-white border-b border-l border-slate-100 rotate-45"></div>
                                            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 px-1">Recent Chats</h4>
                                            <div className="flex flex-col gap-1">
                                                {RECENT_CHATS_PREVIEW.map((chatTitle, idx) => (
                                                    <button 
                                                        key={idx}
                                                        onClick={() => setActiveTab('chat')} 
                                                        className="text-left px-3 py-2 rounded-lg hover:bg-slate-50 transition-colors text-sm font-bold text-slate-700 truncate hover:text-blue-600"
                                                    >
                                                        {chatTitle}
                                                    </button>
                                                ))}
                                            </div>
                                            <div className="mt-3 pt-3 border-t border-slate-100">
                                                <button 
                                                    onClick={() => setActiveTab('chat')}
                                                    className="w-full text-center text-xs font-bold text-blue-600 hover:text-blue-700 transition-colors"
                                                >
                                                    View all chats &rarr;
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                            
                            <div className="mt-auto pt-6 flex flex-col gap-1">
                                <button onClick={() => setIsSettingsOpen(true)} className="flex items-center gap-3 w-full p-2.5 rounded-xl text-slate-600 hover:bg-slate-100 font-medium transition-colors border border-transparent">
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
                                            ? 'bg-white border border-slate-200 text-blue-600 shadow-sm' 
                                            : 'text-slate-600 hover:bg-slate-100 border border-transparent'
                                    }`}
                                >
                                    <span className="shrink-0"><item.icon /></span>
                                    {!isCollapsed && <span className="truncate">{item.label}</span>}
                                </button>
                            ))}

                            <div className="mt-auto pt-6 flex flex-col gap-1">
                                <button onClick={() => setIsSettingsOpen(true)} className="flex items-center gap-3 w-full p-2.5 rounded-xl text-slate-600 hover:bg-slate-100 font-medium transition-colors">
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
            <main className="flex-1 flex flex-col relative w-full h-full overflow-hidden bg-white">
                {React.Children.map(children, child => {
                    if (React.isValidElement(child)) {
                        return React.cloneElement(child, {
                            activeTab,
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
                />
            )}
        </div>
    );
};

export default DashboardShell;
