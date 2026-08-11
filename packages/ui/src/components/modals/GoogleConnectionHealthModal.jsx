import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { gsap } from 'gsap';
import { useGoogleConnect } from '../../api/hooks/useAuth.js';
import { useToast } from '../../context/ToastContext.jsx';
import Button from '../ui/Button.jsx';

export default function GoogleConnectionHealthModal({ status, onClose }) {
    const modalRef = useRef(null);
    const overlayRef = useRef(null);
    const connectMutation = useGoogleConnect();
    const toast = useToast();

    useEffect(() => {
        if (!modalRef.current || !overlayRef.current) return undefined;
        if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined;
        gsap.fromTo(overlayRef.current, { opacity: 0 }, { opacity: 1, duration: 0.2, ease: 'power2.out' });
        gsap.fromTo(modalRef.current, { opacity: 0, y: 18, scale: 0.98 }, { opacity: 1, y: 0, scale: 1, duration: 0.28, ease: 'power2.out' });
        return undefined;
    }, []);

    if (!status?.requiresReconnect) return null;

    const reconnect = async () => {
        try {
            const response = await connectMutation.mutateAsync();
            if (response?.url) window.location.href = response.url;
        } catch (error) {
            toast.error(error.message || 'Could not start Google reconnection.');
        }
    };

    const hasMissingScopes = status.reason === 'missing_scopes';
    const description = hasMissingScopes
        ? 'Your Google account is connected, but Promptly needs spreadsheet permissions again to create and update Sheets.'
        : 'Your Google account is connected, but Google rejected the saved access token. Reconnect once to restore spreadsheet automations.';

    return createPortal(
        <div className="fixed inset-0 z-[100500] flex items-center justify-center p-4 sm:p-6" role="presentation">
            <div ref={overlayRef} className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm" />
            <section ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="google-health-title" className="relative w-full max-w-md overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.28)]">
                <div className="h-1.5 bg-gradient-to-r from-[#5b4ee8] via-[#7c6df1] to-[#c8f17b]" />
                <div className="p-6 sm:p-7">
                    <div className="flex items-start gap-4">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-indigo-200 bg-indigo-50 text-indigo-600">
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M12 3v4" /><path d="M12 17v4" /><path d="m4.22 4.22 2.83 2.83" /><path d="m16.95 16.95 2.83 2.83" /><path d="M3 12h4" /><path d="M17 12h4" /><path d="m4.22 19.78 2.83-2.83" /><path d="m16.95 7.05 2.83-2.83" /><circle cx="12" cy="12" r="3" />
                            </svg>
                        </div>
                        <div className="min-w-0">
                            <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-indigo-600">Google connection</p>
                            <h2 id="google-health-title" className="mt-1 text-xl font-extrabold tracking-tight text-slate-900">Google needs your attention</h2>
                        </div>
                    </div>

                    <p className="mt-5 text-sm leading-6 text-slate-600">{description}</p>

                    <div className="mt-4 flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-sm font-black text-indigo-600 shadow-sm">G</span>
                        <div className="min-w-0"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Connected account</p><p className="truncate text-sm font-semibold text-slate-800">{status.accountEmail || 'Google account'}</p></div>
                    </div>

                    <div className="mt-6 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
                        <button type="button" onClick={onClose} className="rounded-xl px-4 py-2.5 text-sm font-bold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800">Not now</button>
                        <Button variant="primary" onClick={reconnect} isLoading={connectMutation.isPending} loadingText="Opening Google…">Reconnect Google</Button>
                    </div>
                    <p className="mt-4 text-center text-[11px] font-medium leading-5 text-slate-400">You will return to Promptly after Google confirms the connection.</p>
                </div>
            </section>
        </div>,
        document.body
    );
}
