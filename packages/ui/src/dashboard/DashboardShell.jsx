import React, { useState } from 'react';
import { clearAuthToken, clearAuthUser } from '../utils/storage.js';

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

const DashboardShell = ({ user, onUserUpdate, onLogout, children }) => {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [showRoleDropdown, setShowRoleDropdown] = useState(false);

    const handleLogout = () => {
        clearAuthToken();
        clearAuthUser();
        if (onLogout) onLogout();
    };

    const handleSwitchRole = (newRole) => {
        setShowRoleDropdown(false);
        const updatedUser = { ...user, experienceLevel: newRole };
        if (onUserUpdate) onUserUpdate(updatedUser);
    };

    const isNewbie = user?.experienceLevel === 'newbie';

    return (
        <div className="flex h-screen bg-[#f7f9fc] text-slate-900 font-['Space_Grotesk','Manrope',sans-serif] overflow-hidden">
            
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
                <div className="flex-1 overflow-y-auto py-4 flex flex-col gap-1 px-3">
                    {/* Newbie Navigation */}
                    {isNewbie && (
                        <>
                            <div className="px-2 mb-1 mt-2 text-xs font-bold uppercase tracking-wider text-slate-400 opacity-80 whitespace-nowrap overflow-hidden">
                                {!isCollapsed && 'Chat'}
                            </div>
                            <button className="flex items-center gap-3 w-full p-2.5 rounded-xl bg-white border border-slate-200 text-slate-700 shadow-sm font-semibold transition-colors">
                                <span className="shrink-0 text-blue-600"><MessageSquareIcon /></span>
                                {!isCollapsed && <span className="truncate">New Chat</span>}
                            </button>
                            <button className="flex items-center gap-3 w-full p-2.5 rounded-xl text-slate-600 hover:bg-slate-100 font-medium transition-colors">
                                <span className="shrink-0"><BookIcon /></span>
                                {!isCollapsed && <span className="truncate">Tutorial Docs</span>}
                            </button>
                        </>
                    )}

                    {/* Professional Navigation (n8n Structure, Prompty Style) */}
                    {!isNewbie && (
                        <>
                            <button className="flex items-center gap-3 w-full p-2.5 rounded-xl bg-white border border-slate-200 text-slate-700 shadow-sm font-semibold transition-colors">
                                <span className="shrink-0 text-blue-600"><TerminalIcon /></span>
                                {!isCollapsed && <span className="truncate">Overview</span>}
                            </button>
                            <button className="flex items-center gap-3 w-full p-2.5 rounded-xl text-slate-600 hover:bg-slate-100 font-medium transition-colors">
                                <span className="shrink-0"><MessageSquareIcon /></span>
                                {!isCollapsed && <span className="truncate flex items-center gap-2">Chat <span className="text-[0.6rem] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full uppercase tracking-wider font-bold">Beta</span></span>}
                            </button>

                            <div className="mt-auto pt-6 flex flex-col gap-1">
                                <button className="flex items-center gap-3 w-full p-2.5 rounded-xl text-slate-600 hover:bg-slate-100 font-medium transition-colors">
                                    <span className="shrink-0">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>
                                    </span>
                                    {!isCollapsed && <span className="truncate">Templates</span>}
                                </button>
                                <button className="flex items-center gap-3 w-full p-2.5 rounded-xl text-slate-600 hover:bg-slate-100 font-medium transition-colors">
                                    <span className="shrink-0">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>
                                    </span>
                                    {!isCollapsed && <span className="truncate">Insights</span>}
                                </button>
                                <button className="flex items-center gap-3 w-full p-2.5 rounded-xl text-slate-600 hover:bg-slate-100 font-medium transition-colors">
                                    <span className="shrink-0">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                                    </span>
                                    {!isCollapsed && <span className="truncate">Help</span>}
                                </button>
                                <button className="flex items-center gap-3 w-full p-2.5 rounded-xl text-slate-600 hover:bg-slate-100 font-medium transition-colors">
                                    <span className="shrink-0"><SettingsIcon /></span>
                                    {!isCollapsed && <span className="truncate">Settings</span>}
                                </button>
                            </div>
                        </>
                    )}
                </div>

                {/* Bottom Settings / Profile */}
                <div className="p-3 border-t border-slate-200 flex flex-col gap-1">
                    
                    {/* Role Switcher Menu */}
                    {showRoleDropdown && !isCollapsed && (
                        <div className="mb-2 bg-white border border-slate-200 rounded-xl p-1.5 shadow-xl shadow-slate-200/50 flex flex-col gap-0.5 z-50 animate-fade-in">
                            <button onClick={() => handleSwitchRole('newbie')} className={`w-full text-left px-3 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 ${user?.experienceLevel === 'newbie' ? 'bg-cyan-50 text-cyan-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}>
                                <MessageSquareIcon /> Newbie Chat
                            </button>
                            <button onClick={() => handleSwitchRole('professional')} className={`w-full text-left px-3 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 ${user?.experienceLevel === 'professional' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}>
                                <TerminalIcon /> Professional
                            </button>
                            <div className="w-full h-px bg-slate-100 my-1"></div>
                            <button 
                                onClick={handleLogout}
                                className={`w-full text-left px-3 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 text-red-600 hover:bg-red-50`}
                            >
                                <LogOutIcon /> Log out
                            </button>
                        </div>
                    )}

                    {/* User Profile Toggle */}
                    <button 
                        onClick={() => !isCollapsed && setShowRoleDropdown(!showRoleDropdown)}
                        className={`flex items-center gap-3 w-full p-2 rounded-xl transition-colors ${showRoleDropdown ? 'bg-blue-50 border-blue-100' : 'text-slate-700 hover:bg-slate-200'} ${isCollapsed ? 'justify-center' : ''}`}
                    >
                        <div className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-inner">
                            {user?.email ? user.email.substring(0,2).toUpperCase() : 'U'}
                        </div>
                        {!isCollapsed && (
                            <div className="flex flex-col items-start truncate flex-1">
                                <span className="text-sm font-bold truncate w-full">{user?.email || 'User'}</span>
                                <span className="text-[0.65rem] font-bold text-slate-500 uppercase tracking-wider">{user?.experienceLevel || 'Setup'} Mode</span>
                            </div>
                        )}
                    </button>
                </div>
            </aside>

            {/* Main Application Area */}
            <main className="flex-1 flex flex-col relative w-full h-full overflow-hidden bg-white">
                {children}
            </main>
        </div>
    );
};

export default DashboardShell;
