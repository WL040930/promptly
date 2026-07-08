import React, { useState, useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { apiRequest } from '../api/client.js';
import { useToast } from '../components/ToastContext.jsx';
import Button from '../components/Button.jsx';

const SettingsModal = ({ user, onClose, onSwitchRole, onLogout, initialTab = 'general' }) => {
    const [activeTab, setActiveTab] = useState(initialTab);
    const [selectedRole, setSelectedRole] = useState(user?.experienceLevel || 'chat');
    const [isSaving, setIsSaving] = useState(false);
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
    const modalRef = useRef(null);
    const overlayRef = useRef(null);
    const contentRef = useRef(null);
    const toast = useToast();

    useGSAP(() => {
        gsap.from(overlayRef.current, { opacity: 0, duration: 0.3, ease: 'power2.inOut' });
        gsap.from(contentRef.current, { scale: 0.9, opacity: 0, y: 20, duration: 0.4, ease: 'back.out(1.7)', delay: 0.1 });
    }, { scope: modalRef });

    const handleClose = () => {
        gsap.to(overlayRef.current, { opacity: 0, duration: 0.2, ease: 'power2.in' });
        gsap.to(contentRef.current, { 
            opacity: 0, 
            y: 20, 
            scale: 0.95, 
            duration: 0.2, 
            ease: 'power2.in',
            onComplete: onClose
        });
    };

    // Reset selected role if user prop changes externally
    useEffect(() => {
        if (user?.experienceLevel) {
            setSelectedRole(user.experienceLevel);
        }
    }, [user?.experienceLevel]);

    useEffect(() => {
        setActiveTab(initialTab);
    }, [initialTab]);

    const handleSave = async () => {
        if (selectedRole !== user?.experienceLevel) {
            setIsSaving(true);
            try {
                await onSwitchRole(selectedRole);
                handleClose();
            } catch (err) {
                // Error is caught and alerted in DashboardShell
            } finally {
                setIsSaving(false);
            }
        }
    };

    const handleUpdatePassword = async (e) => {
        e.preventDefault();
        if (!newPassword || !confirmPassword) {
            toast.error('Both password fields are required.');
            return;
        }
        if (newPassword !== confirmPassword) {
            toast.error('Passwords do not match.');
            return;
        }

        const isPasswordValid =
            newPassword.length >= 12 &&
            /[A-Z]/.test(newPassword) &&
            /[a-z]/.test(newPassword) &&
            /[0-9]/.test(newPassword) &&
            /[^A-Za-z0-9]/.test(newPassword);

        if (!isPasswordValid) {
            toast.error('Password does not meet the complexity requirements.');
            return;
        }

        setIsUpdatingPassword(true);
        try {
            await apiRequest('/api/auth/change-password', {
                method: 'PUT',
                body: JSON.stringify({ newPassword })
            });
            toast.success('Password updated successfully.');
            setNewPassword('');
            setConfirmPassword('');
            setShowNewPassword(false);
            setShowConfirmPassword(false);
        } catch (err) {
            console.error('Failed to change password:', err);
            toast.error(err?.message || 'An error occurred while changing password.');
        } finally {
            setIsUpdatingPassword(false);
        }
    };

    const passwordRequirements = [
        { label: 'At least 12 characters', met: newPassword.length >= 12 },
        { label: 'One uppercase letter (A-Z)', met: /[A-Z]/.test(newPassword) },
        { label: 'One lowercase letter (a-z)', met: /[a-z]/.test(newPassword) },
        { label: 'One number (0-9)', met: /[0-9]/.test(newPassword) },
        { label: 'One special character (e.g. !@#$)', met: /[^A-Za-z0-9]/.test(newPassword) }
    ];

    const isPasswordValid = passwordRequirements.every(req => req.met);
    const passwordsMatch = newPassword === confirmPassword && confirmPassword !== '';

    const isDirty = selectedRole !== user?.experienceLevel;

    const renderTabs = () => (
        <div className="flex items-center gap-6 px-6 border-b border-slate-100 bg-slate-50/30">
            <button
                onClick={() => setActiveTab('general')}
                className={`py-4 text-sm font-bold border-b-2 transition-colors ${activeTab === 'general' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
            >
                General
            </button>
            <button
                onClick={() => setActiveTab('connections')}
                className={`py-4 text-sm font-bold border-b-2 transition-colors ${activeTab === 'connections' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
            >
                Account Connections
            </button>
        </div>
    );

    const renderGeneral = () => (
        <div className="p-6 flex flex-col gap-8 relative pb-20">
            <div className="flex flex-col gap-4">
                <div>
                    <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Experience Level</h3>
                    <p className="text-sm text-slate-500 mt-1">Choose the interface that best fits your workflow.</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Chat Card */}
                    <button
                        onClick={() => setSelectedRole('chat')}
                        className={`text-left p-4 rounded-xl border-2 transition-all duration-200 flex flex-col gap-2 ${selectedRole === 'chat' ? 'border-indigo-500 bg-indigo-50/50 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'}`}
                    >
                        <div className="flex items-center justify-between w-full">
                            <div className={`p-2 rounded-lg shrink-0 ${selectedRole === 'chat' ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-500'}`}>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                            </div>
                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${selectedRole === 'chat' ? 'border-indigo-500' : 'border-slate-300'}`}>
                                {selectedRole === 'chat' && <div className="w-2.5 h-2.5 rounded-full bg-indigo-500"></div>}
                            </div>
                        </div>
                        <div className="mt-2 flex-1">
                            <h4 className={`font-bold ${selectedRole === 'chat' ? 'text-indigo-900' : 'text-slate-700'}`}>Chat Mode</h4>
                            <p className="text-xs text-slate-500 mt-1 leading-relaxed">A streamlined chat-based interface perfect for quick prompting and easy generation.</p>
                            <div className="mt-3 inline-block px-2 py-1 bg-slate-100 text-slate-500 text-[10px] font-bold uppercase tracking-wider rounded">Recommended for everyone</div>
                        </div>
                    </button>

                    {/* Builder Card */}
                    <button
                        onClick={() => setSelectedRole('builder')}
                        className={`text-left p-4 rounded-xl border-2 transition-all duration-200 flex flex-col gap-2 ${selectedRole === 'builder' ? 'border-indigo-500 bg-indigo-50/50 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'}`}
                    >
                        <div className="flex items-center justify-between w-full">
                            <div className={`p-2 rounded-lg shrink-0 ${selectedRole === 'builder' ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-500'}`}>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line></svg>
                            </div>
                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${selectedRole === 'builder' ? 'border-indigo-500' : 'border-slate-300'}`}>
                                {selectedRole === 'builder' && <div className="w-2.5 h-2.5 rounded-full bg-indigo-500"></div>}
                            </div>
                        </div>
                        <div className="mt-2 flex-1">
                            <h4 className={`font-bold ${selectedRole === 'builder' ? 'text-indigo-900' : 'text-slate-700'}`}>Workflow Builder Mode</h4>
                            <p className="text-xs text-slate-500 mt-1 leading-relaxed">Advanced node-based workflow builder for complex prompt chaining and logic.</p>
                            <div className="mt-3 inline-block px-2 py-1 bg-slate-100 text-slate-500 text-[10px] font-bold uppercase tracking-wider rounded">Recommended for power users</div>
                        </div>
                    </button>
                </div>
            </div>

            {/* Change Password Section */}
            <div className="pt-6 border-t border-slate-100">
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-2">Security</h3>
                <p className="text-sm text-slate-500 mb-4">Ensure your account is using a long, secure password.</p>
                <form onSubmit={handleUpdatePassword} className="flex flex-col gap-6 p-4 rounded-xl border border-slate-100 bg-slate-50/50">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Inputs Column */}
                        <div className="flex flex-col gap-4">
                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">New Password</label>
                                <div className="relative">
                                    <input
                                        type={showNewPassword ? "text" : "password"}
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        className="w-full pl-3 pr-10 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:border-indigo-500 transition-colors"
                                        placeholder="••••••••••••"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowNewPassword(!showNewPassword)}
                                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                                    >
                                        {showNewPassword ? (
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"></path></svg>
                                        ) : (
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"></path><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                                        )}
                                    </button>
                                </div>
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Confirm New Password</label>
                                <div className="relative">
                                    <input
                                        type={showConfirmPassword ? "text" : "password"}
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        className="w-full pl-3 pr-10 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:border-indigo-500 transition-colors"
                                        placeholder="••••••••••••"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                                    >
                                        {showConfirmPassword ? (
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"></path></svg>
                                        ) : (
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"></path><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                                        )}
                                    </button>
                                </div>
                                {confirmPassword && !passwordsMatch && (
                                    <span className="text-[11px] font-bold text-red-500 mt-1">Passwords do not match</span>
                                )}
                            </div>
                        </div>

                        {/* Requirements Column */}
                        <div className="flex flex-col gap-2 p-3 bg-white rounded-lg border border-slate-100">
                            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Requirements</span>
                            <ul className="flex flex-col gap-1.5">
                                {passwordRequirements.map((req, idx) => (
                                    <li key={idx} className="flex items-center gap-2 text-xs">
                                        <div className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${req.met ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                                            <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5"></path>
                                            </svg>
                                        </div>
                                        <span className={`font-medium ${req.met ? 'text-slate-600 line-through decoration-slate-300' : 'text-slate-500'}`}>{req.label}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>

                    <div className="flex justify-end pt-2 border-t border-slate-100/50">
                        <Button
                            type="submit"
                            variant="primary"
                            disabled={isUpdatingPassword || !isPasswordValid || !passwordsMatch}
                            className="text-xs uppercase tracking-wider"
                            isLoading={isUpdatingPassword}
                            loadingText="Updating..."
                        >
                            Update Password
                        </Button>
                    </div>
                </form>
            </div>

            <div className="pt-6 border-t border-slate-100">
                <h3 className="text-sm font-bold text-red-600 uppercase tracking-wider mb-4">Danger Zone</h3>
                <Button
                    variant="danger"
                    onClick={() => { onLogout(); handleClose(); }}
                    className="w-full justify-between px-4 py-3 group"
                    iconRight={<svg className="opacity-0 group-hover:opacity-100 transition-opacity" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 19"></polyline></svg>}
                >
                    <div className="flex items-center gap-3">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
                        Log out of all devices
                    </div>
                </Button>
            </div>

            {/* Save Button Overlay */}
            <div className={`absolute bottom-0 left-0 right-0 p-4 bg-white border-t border-slate-100 flex justify-end transition-transform duration-300 ${(isDirty || isSaving) ? 'translate-y-0 opacity-100 z-10' : 'translate-y-full opacity-0 -z-10'}`}>
                <Button
                    variant="primary"
                    onClick={handleSave}
                    disabled={!isDirty || isSaving}
                    isLoading={isSaving}
                    loadingText="Saving..."
                >
                    Save Changes
                </Button>
            </div>
        </div>
    );

    const renderConnections = () => (
        <div className="p-6 flex flex-col gap-6 relative pb-20">
            <div className="flex flex-col gap-2">
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Primary Account</h3>
                <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="w-12 h-12 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-lg shadow-inner">
                        {user?.email ? user.email.substring(0, 2).toUpperCase() : 'U'}
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
                                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
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
                                    await apiRequest('/api/auth/google/disconnect', {
                                        method: 'POST'
                                    });
                                    toast.success('Successfully disconnected Google account.');
                                    setTimeout(() => window.location.reload(), 1000);
                                } catch (err) {
                                    console.error('Failed to disconnect Google account', err);
                                    toast.error(err?.message || 'An error occurred while disconnecting.');
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
                                    const data = await apiRequest('/api/auth/google/connect');
                                    if (data.url) {
                                        window.location.href = data.url;
                                    } else {
                                        toast.error('Failed to initialize Google connection.');
                                    }
                                } catch (err) {
                                    console.error('Failed to init Google connect', err);
                                    toast.error(err?.message || 'An error occurred while connecting.');
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
        <div ref={modalRef} className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6" style={{ zIndex: 99999 }}>
            <div 
                ref={overlayRef}
                className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
                onClick={handleClose}
            ></div>
            <div ref={contentRef} className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
                <div className="p-4 px-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg shadow-sm">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
                        </div>
                        <h2 className="text-xl font-extrabold text-slate-800 tracking-tight">Settings</h2>
                    </div>
                    <button onClick={handleClose} className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>

                {renderTabs()}

                <div className="bg-white min-h-[350px] max-h-[60vh] overflow-y-auto relative">
                    {activeTab === 'general' ? renderGeneral() : renderConnections()}
                </div>
            </div>
        </div>
    );
};

export default SettingsModal;
