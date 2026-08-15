import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { useChangePassword, useDisconnectGoogle, useGoogleConnect } from '../api/hooks/useAuth.js';
import { useToast } from '../context/ToastContext.jsx';
import { useBrowserNotifications } from '../context/BrowserNotificationContext.jsx';
import Button from '../components/ui/Button.jsx';
import { EDITOR_PREFERENCES, getEditorPreference, setEditorPreference } from '../utils/storage.js';

export default function SettingsModal({ user, onClose, onLogout, initialTab = 'general' }) {
    const [activeTab, setActiveTab] = useState(initialTab);
    const [editorPreference, setEditorPreferenceState] = useState(() => getEditorPreference());
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const changePasswordMutation = useChangePassword();
    const disconnectGoogleMutation = useDisconnectGoogle();
    const googleConnectMutation = useGoogleConnect();
    const modalRef = useRef(null);
    const overlayRef = useRef(null);
    const contentRef = useRef(null);
    const toast = useToast();
    const browserNotifications = useBrowserNotifications();

    useGSAP(() => {
        if (!overlayRef.current || !contentRef.current) return;
        gsap.from(overlayRef.current, { opacity: 0, duration: 0.25 });
        gsap.from(contentRef.current, { scale: 0.96, opacity: 0, y: 16, duration: 0.3, ease: 'power2.out' });
    }, { scope: modalRef });

    useEffect(() => setActiveTab(initialTab), [initialTab]);

    const close = () => {
        if (!overlayRef.current || !contentRef.current) return onClose();
        gsap.to(overlayRef.current, { opacity: 0, duration: 0.15 });
        gsap.to(contentRef.current, { opacity: 0, y: 12, duration: 0.15, onComplete: onClose });
    };

    const savePreference = value => {
        setEditorPreferenceState(value);
        setEditorPreference(value);
        toast.success('Editing preference saved.');
    };

    const toggleBrowserNotifications = async () => {
        if (!browserNotifications.enabled) {
            const enabled = await browserNotifications.setEnabled(true);
            if (enabled) toast.success('Browser notifications enabled.');
            else if (browserNotifications.permission === 'denied') toast.error('Browser notifications are blocked. Allow them in your browser site settings.');
            else if (!browserNotifications.supported) toast.error('This browser does not support notifications.');
            else toast.error('Browser notifications were not enabled.');
            return;
        }
        await browserNotifications.setEnabled(false);
        toast.success('Browser notifications disabled.');
    };

    const sendTestBrowserNotification = () => {
        if (browserNotifications.sendTestNotification()) toast.success('Test notification sent.');
        else if (browserNotifications.permission === 'granted') toast.error('Your browser or system did not display the test. Check that notifications are allowed for this browser and that Focus mode is off.');
        else toast.error('Enable browser notifications before sending a test.');
    };

    const updatePassword = async event => {
        event.preventDefault();
        if (newPassword !== confirmPassword) return toast.error('Passwords do not match.');
        const valid = newPassword.length >= 12 && /[A-Z]/.test(newPassword) && /[a-z]/.test(newPassword) && /[0-9]/.test(newPassword) && /[^A-Za-z0-9]/.test(newPassword);
        if (!valid) return toast.error('Password must be at least 12 characters and include uppercase, lowercase, number, and symbol.');
        try {
            await changePasswordMutation.mutateAsync(newPassword);
            setNewPassword('');
            setConfirmPassword('');
            toast.success('Password updated successfully.');
        } catch (error) {
            toast.error(error.message || 'Could not update password.');
        }
    };

    const connectGoogle = async () => {
        try {
            const returnTo = `${window.location.pathname}${window.location.search}`;
            const response = await googleConnectMutation.mutateAsync(returnTo);
            if (response?.url) window.location.href = response.url;
        } catch (error) {
            toast.error(error.message || 'Could not connect Google.');
        }
    };

    const disconnectGoogle = async () => {
        try {
            await disconnectGoogleMutation.mutateAsync();
            toast.success('Google account disconnected.');
        } catch (error) {
            toast.error(error.message || 'Could not disconnect Google.');
        }
    };

    return createPortal(
        <div ref={modalRef} className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
            <div ref={overlayRef} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={close} />
            <div ref={contentRef} className="relative flex max-h-[86vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={event => event.stopPropagation()}>
                <header className="flex items-center justify-between border-b border-slate-100 bg-slate-50/60 px-6 py-4">
                    <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-500">Account</p><h2 className="mt-1 text-xl font-extrabold tracking-tight text-slate-800">Settings</h2></div>
                    <button type="button" onClick={close} className="rounded-xl p-2 text-slate-400 hover:bg-slate-200 hover:text-slate-700" aria-label="Close settings">✕</button>
                </header>

                <nav className="flex gap-6 border-b border-slate-100 bg-slate-50/30 px-6">
                    {['general', 'connections'].map(tab => <button key={tab} type="button" onClick={() => setActiveTab(tab)} className={`border-b-2 py-4 text-sm font-bold capitalize ${activeTab === tab ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>{tab}</button>)}
                </nav>

                <div className="overflow-y-auto">
                    {activeTab === 'general' ? (
                        <div className="space-y-8 p-6">
                            <section>
                                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800">Opening preference</h3>
                                <p className="mt-1 text-sm text-slate-500">Choose the workspace you want when creating a new automation. You can always switch later.</p>
                                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                    {[
                                        [EDITOR_PREFERENCES.AI, 'AI editor', 'Recommended for beginners: describe what you want, and Promptly helps build the workflow.'],
                                        [EDITOR_PREFERENCES.VISUAL, 'Visual editor', 'Best when you already know the steps and want to arrange them yourself.']
                                    ].map(([value, label, description]) => <button key={value} type="button" onClick={() => savePreference(value)} className={`rounded-xl border-2 p-4 text-left transition ${editorPreference === value ? 'border-indigo-500 bg-indigo-50/60' : 'border-slate-200 hover:border-indigo-200'}`}><p className="font-bold text-slate-800">{label}</p><p className="mt-1 text-xs leading-5 text-slate-500">{description}</p></button>)}
                                </div>
                            </section>

                            <section className="border-t border-slate-100 pt-6">
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800">Browser notifications</h3>
                                        <p className="mt-1 max-w-lg text-sm text-slate-500">Get an alert when Promptly finishes an AI request, needs clarification, or has changes ready to review.</p>
                                    </div>
                                    <button
                                        type="button"
                                        role="switch"
                                        aria-checked={browserNotifications.enabled}
                                        aria-label="Browser notifications"
                                        onClick={toggleBrowserNotifications}
                                        disabled={!browserNotifications.supported || browserNotifications.permission === 'denied'}
                                        className={`relative mt-1 h-7 w-12 shrink-0 rounded-full transition ${browserNotifications.enabled ? 'bg-indigo-600' : 'bg-slate-200'} disabled:cursor-not-allowed disabled:opacity-50`}
                                    >
                                        <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition ${browserNotifications.enabled ? 'left-6' : 'left-1'}`} />
                                    </button>
                                </div>
                                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                                    {!browserNotifications.supported && <span>This browser does not support system notifications.</span>}
                                    {browserNotifications.supported && browserNotifications.permission === 'denied' && <span>Notifications are blocked. Allow them in your browser site settings.</span>}
                                    {browserNotifications.supported && browserNotifications.permission === 'default' && <span>Promptly will ask for permission when you enable this.</span>}
                                    {browserNotifications.enabled && browserNotifications.permission === 'granted' && <button type="button" onClick={sendTestBrowserNotification} className="font-bold text-indigo-600 hover:text-indigo-800">Send test notification</button>}
                                </div>
                            </section>

                            <section className="border-t border-slate-100 pt-6">
                                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800">Security</h3>
                                <p className="mt-1 text-sm text-slate-500">Update the password used to sign in to Promptly.</p>
                                <form onSubmit={updatePassword} className="mt-4 grid gap-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4 sm:grid-cols-2">
                                    <label className="text-xs font-bold uppercase tracking-wider text-slate-600">New password<input type={showNewPassword ? 'text' : 'password'} value={newPassword} onChange={event => setNewPassword(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" /></label>
                                    <label className="text-xs font-bold uppercase tracking-wider text-slate-600">Confirm password<input type={showConfirmPassword ? 'text' : 'password'} value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" /></label>
                                    <div className="flex gap-2 text-xs text-slate-500 sm:col-span-2"><button type="button" onClick={() => setShowNewPassword(value => !value)} className="underline">{showNewPassword ? 'Hide' : 'Show'} new password</button><button type="button" onClick={() => setShowConfirmPassword(value => !value)} className="underline">{showConfirmPassword ? 'Hide' : 'Show'} confirmation</button></div>
                                    <div className="sm:col-span-2"><Button type="submit" variant="primary" disabled={changePasswordMutation.isPending}>Update password</Button></div>
                                </form>
                            </section>

                            <section className="border-t border-slate-100 pt-6"><h3 className="text-sm font-bold uppercase tracking-wider text-red-600">Danger zone</h3><Button variant="danger" onClick={() => { onLogout(); close(); }} className="mt-4 w-full">Sign out</Button></section>
                        </div>
                    ) : (
                        <div className="space-y-6 p-6">
                            <section><h3 className="text-sm font-bold uppercase tracking-wider text-slate-800">Connected services</h3><p className="mt-1 text-sm text-slate-500">Connect services your automations can use.</p></section>
                            <div data-tour="settings-connections" className="flex items-center justify-between rounded-xl border border-slate-200 p-4"><div><p className="font-bold text-slate-800">Google Account</p><p className="mt-1 text-xs text-slate-500">{user?.googleEmail ? `Connected as ${user.googleEmail}` : 'Not connected'}</p></div>{user?.googleId ? <button type="button" onClick={disconnectGoogle} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 hover:border-red-200 hover:bg-red-50 hover:text-red-600">Disconnect</button> : <button type="button" onClick={connectGoogle} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">Connect</button>}</div>
                        </div>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
}
