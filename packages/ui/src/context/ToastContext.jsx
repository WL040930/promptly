import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';

const ToastContext = createContext(null);

// Keep notifications above the highest modal layer currently used by the UI
// (the workflow confirmation layer is 100300).
const TOAST_Z_INDEX = 100400;

export const useToast = () => {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
};

export const ToastProvider = ({ children }) => {
    const [toasts, setToasts] = useState([]);

    const showToast = useCallback((message, type = 'success', options = {}) => {
        const id = Date.now() + Math.random().toString();
        setToasts(prev => [...prev, { id, message, type, action: options.action || null }]);
    }, []);

    const success = useCallback((message, options) => showToast(message, 'success', options), [showToast]);
    const error = useCallback((message, options) => showToast(message, 'error', options), [showToast]);
    const info = useCallback((message, options) => showToast(message, 'info', options), [showToast]);

    const removeToast = useCallback((id) => {
        setToasts(prev => prev.filter(toast => toast.id !== id));
    }, []);

    const value = React.useMemo(() => ({ success, error, info }), [success, error, info]);

    return (
        <ToastContext.Provider value={value}>
            {children}
            <ToastContainer toasts={toasts} removeToast={removeToast} />
        </ToastContext.Provider>
    );
};

const ToastContainer = ({ toasts, removeToast }) => {
    return (
        <div
            className="fixed bottom-8 left-1/2 -translate-x-1/2 flex flex-col gap-3 pointer-events-none"
            style={{ zIndex: TOAST_Z_INDEX }}
        >
            {toasts.map(toast => (
                <ToastItem key={toast.id} toast={toast} removeToast={removeToast} />
            ))}
        </div>
    );
};

const ToastItem = ({ toast, removeToast }) => {
    const el = useRef(null);

    useGSAP(() => {
        if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
            const timer = window.setTimeout(() => removeToast(toast.id), 3000);
            return () => window.clearTimeout(timer);
        }
        // Entrance animation
        const tl = gsap.timeline();
        tl.from(el.current, {
            y: 30,
            opacity: 0,
            duration: 0.4,
            ease: 'back.out(1.5)'
        })
        .to(el.current, {
            y: -10,
            opacity: 0,
            duration: 0.3,
            ease: 'power2.in',
            delay: 3 // Auto-dismiss after 3s
        })
        .call(() => removeToast(toast.id));
    }, { scope: el, dependencies: [toast.id, removeToast] });

    // Icons based on type
    const icons = {
        success: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-emerald-500 shrink-0">
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 6L9 17l-5-5" />
            </svg>
        ),
        error: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-red-500 shrink-0">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
        ),
        info: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-indigo-500 shrink-0">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
        )
    };

    return (
        <div 
            ref={el} 
            className="flex items-center gap-3 px-5 py-3.5 bg-white border border-slate-200 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] pointer-events-auto shrink-0 w-max max-w-[90vw]"
        >
            {icons[toast.type]}
            <span className="text-sm font-semibold text-slate-800">{toast.message}</span>
            {toast.action && (
                <button
                    type="button"
                    onClick={() => {
                        toast.action.onClick?.();
                        removeToast(toast.id);
                    }}
                    className="ml-1 rounded-lg px-2 py-1 text-xs font-bold text-indigo-600 transition-colors hover:bg-indigo-50"
                >
                    {toast.action.label}
                </button>
            )}
            <button 
                onClick={() => {
                    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
                        removeToast(toast.id);
                        return;
                    }
                    gsap.to(el.current, { y: -10, opacity: 0, duration: 0.2, onComplete: () => removeToast(toast.id) });
                }} 
                className="ml-2 p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors shrink-0"
            >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
        </div>
    );
};
