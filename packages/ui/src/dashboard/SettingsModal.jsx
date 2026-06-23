import React, { useState, useEffect } from 'react';

const SettingsModal = ({ user, onClose, onSwitchRole, onLogout }) => {
    const [activeTab, setActiveTab] = useState('general');
    const [selectedRole, setSelectedRole] = useState(user?.experienceLevel || 'chat');
    const [isSaving, setIsSaving] = useState(false);

    // Reset selected role if user prop changes externally
    useEffect(() => {
        if (user?.experienceLevel) {
            setSelectedRole(user.experienceLevel);
        }
    }, [user?.experienceLevel]);

    const handleSave = async () => {
        if (selectedRole !== user?.experienceLevel) {
            setIsSaving(true);
            try {
                await onSwitchRole(selectedRole);
                onClose();
            } catch (err) {
                // Error is caught and alerted in DashboardShell
            } finally {
                setIsSaving(false);
            }
        }
    };

    const isDirty = selectedRole !== user?.experienceLevel;

    const renderTabs = () => (
        <div className="flex items-center gap-6 px-6 border-b border-slate-100 bg-slate-50/30">
            <button 
                onClick={() => setActiveTab('general')}
                className={`py-4 text-sm font-bold border-b-2 transition-colors ${activeTab === 'general' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
            >
                General
            </button>
            <button 
                onClick={() => setActiveTab('connections')}
                className={`py-4 text-sm font-bold border-b-2 transition-colors ${activeTab === 'connections' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
            >
                Account Connections
            </button>
        </div>
    );

    const renderGeneral = () => (
        <div className="p-6 flex flex-col gap-8 animate-fade-in relative pb-20">
            <div className="flex flex-col gap-4">
                <div>
                    <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Experience Level</h3>
                    <p className="text-sm text-slate-500 mt-1">Choose the interface that best fits your workflow.</p>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Chat Card */}
                    <button 
                        onClick={() => setSelectedRole('chat')}
                        className={`text-left p-4 rounded-xl border-2 transition-all duration-200 flex flex-col gap-2 ${selectedRole === 'chat' ? 'border-blue-500 bg-blue-50/50 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'}`}
                    >
                        <div className="flex items-center justify-between w-full">
                            <div className={`p-2 rounded-lg shrink-0 ${selectedRole === 'chat' ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-500'}`}>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                            </div>
                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${selectedRole === 'chat' ? 'border-blue-500' : 'border-slate-300'}`}>
                                {selectedRole === 'chat' && <div className="w-2.5 h-2.5 rounded-full bg-blue-500"></div>}
                            </div>
                        </div>
                        <div className="mt-2 flex-1">
                            <h4 className={`font-bold ${selectedRole === 'chat' ? 'text-blue-900' : 'text-slate-700'}`}>Chat Mode</h4>
                            <p className="text-xs text-slate-500 mt-1 leading-relaxed">A streamlined chat-based interface perfect for quick prompting and easy generation.</p>
                            <div className="mt-3 inline-block px-2 py-1 bg-slate-100 text-slate-500 text-[10px] font-bold uppercase tracking-wider rounded">Recommended for everyone</div>
                        </div>
                    </button>

                    {/* Builder Card */}
                    <button 
                        onClick={() => setSelectedRole('builder')}
                        className={`text-left p-4 rounded-xl border-2 transition-all duration-200 flex flex-col gap-2 ${selectedRole === 'builder' ? 'border-blue-500 bg-blue-50/50 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'}`}
                    >
                        <div className="flex items-center justify-between w-full">
                            <div className={`p-2 rounded-lg shrink-0 ${selectedRole === 'builder' ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-500'}`}>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line></svg>
                            </div>
                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${selectedRole === 'builder' ? 'border-blue-500' : 'border-slate-300'}`}>
                                {selectedRole === 'builder' && <div className="w-2.5 h-2.5 rounded-full bg-blue-500"></div>}
                            </div>
                        </div>
                        <div className="mt-2 flex-1">
                            <h4 className={`font-bold ${selectedRole === 'builder' ? 'text-blue-900' : 'text-slate-700'}`}>Workflow Builder Mode</h4>
                            <p className="text-xs text-slate-500 mt-1 leading-relaxed">Advanced node-based workflow builder for complex prompt chaining and logic.</p>
                            <div className="mt-3 inline-block px-2 py-1 bg-slate-100 text-slate-500 text-[10px] font-bold uppercase tracking-wider rounded">Recommended for power users</div>
                        </div>
                    </button>
                </div>
            </div>

            <div className="pt-6 border-t border-slate-100">
                <h3 className="text-sm font-bold text-red-600 uppercase tracking-wider mb-4">Danger Zone</h3>
                <button 
                    onClick={() => { onLogout(); onClose(); }} 
                    className="w-full text-left px-4 py-3 rounded-xl text-sm font-bold transition-colors flex items-center justify-between bg-red-50 text-red-600 hover:bg-red-100 border border-red-100 group"
                >
                    <div className="flex items-center gap-3">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
                        Log out of all devices
                    </div>
                    <svg className="opacity-0 group-hover:opacity-100 transition-opacity" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 19"></polyline></svg>
                </button>
            </div>

            {/* Save Button Overlay */}
            <div className={`absolute bottom-0 left-0 right-0 p-4 bg-white border-t border-slate-100 flex justify-end transition-transform duration-300 ${(isDirty || isSaving) ? 'translate-y-0 opacity-100 z-10' : 'translate-y-full opacity-0 -z-10'}`}>
                <button 
                    onClick={handleSave}
                    disabled={!isDirty || isSaving}
                    className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-xl transition-colors shadow-md shadow-blue-600/20 flex items-center gap-2"
                >
                    {isSaving ? (
                        <>
                            <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                            Saving...
                        </>
                    ) : (
                        'Save Changes'
                    )}
                </button>
            </div>
        </div>
    );

    const renderConnections = () => (
        <div className="p-6 flex flex-col gap-6 animate-fade-in relative pb-20">
            <div className="flex flex-col gap-2">
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Primary Account</h3>
                <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="w-12 h-12 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-lg shadow-inner">
                        {user?.email ? user.email.substring(0,2).toUpperCase() : 'U'}
                    </div>
                    <div className="flex flex-col truncate">
                        <span className="text-base font-bold text-slate-800 truncate">{user?.email || 'User Account'}</span>
                        <span className="text-sm font-medium text-slate-500">Email Login</span>
                    </div>
                </div>
            </div>

            <div className="flex flex-col gap-3">
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Linked Accounts</h3>
                <p className="text-sm text-slate-500 mb-2">Connect other accounts to enable quick login and integrations.</p>
                
                <div className="flex items-center justify-between p-4 border border-slate-200 rounded-xl bg-white hover:border-slate-300 transition-all">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center border border-slate-100 shrink-0">
                            {/* Simple Google SVG Icon */}
                            <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                            </svg>
                        </div>
                        <div className="flex flex-col">
                            <span className="font-bold text-slate-800">Google Account</span>
                            <span className="text-xs text-slate-500">{user?.googleEmail ? `Connected as ${user.googleEmail}` : 'Not connected'}</span>
                        </div>
                    </div>
                    {user?.googleId ? (
                        <button 
                            onClick={async () => {
                                try {
                                    const token = localStorage.getItem('auth_token');
                                    const res = await fetch('http://localhost:3000/api/auth/google/disconnect', {
                                        method: 'POST',
                                        headers: { 'Authorization': `Bearer ${token}` }
                                    });
                                    if (res.ok) {
                                        window.location.reload();
                                    }
                                } catch (err) {
                                    console.error('Failed to disconnect Google account', err);
                                }
                            }}
                            className="px-4 py-2 bg-slate-100 border border-slate-200 rounded-lg text-sm font-bold text-slate-500 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-all shadow-sm"
                        >
                            Disconnect
                        </button>
                    ) : (
                        <button 
                            onClick={async () => {
                                try {
                                    const token = localStorage.getItem('auth_token');
                                    const res = await fetch('http://localhost:3000/api/auth/google/connect', {
                                        headers: { 'Authorization': `Bearer ${token}` }
                                    });
                                    const data = await res.json();
                                    if (data.url) {
                                        window.location.href = data.url;
                                    }
                                } catch (err) {
                                    console.error('Failed to init Google connect', err);
                                }
                            }}
                            className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-bold text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm"
                        >
                            Connect
                        </button>
                    )}
                </div>
            </div>
        </div>
    );

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
                <div className="p-4 px-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-100 text-blue-600 rounded-lg shadow-sm">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
                        </div>
                        <h2 className="text-xl font-extrabold text-slate-800 tracking-tight">Settings</h2>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>
                
                {renderTabs()}

                <div className="bg-white min-h-[350px] relative overflow-hidden">
                    {activeTab === 'general' ? renderGeneral() : renderConnections()}
                </div>
            </div>
        </div>
    );
};

export default SettingsModal;
