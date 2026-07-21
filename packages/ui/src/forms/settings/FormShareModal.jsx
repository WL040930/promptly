import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';

/**
 * FormShareModal — modal for sharing a form via link or embed code.
 * Upgraded with premium design.
 */
const FormShareModal = ({ form, isOpen, onClose }) => {
    const [activeShareTab, setActiveShareTab] = useState('link');
    const [copied, setCopied] = useState(false);
    const linkInputRef = useRef(null);
    const overlayRef = useRef(null);
    const modalRef = useRef(null);

    useGSAP(() => {
        if (isOpen && overlayRef.current && modalRef.current) {
            if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
                gsap.set(overlayRef.current, { opacity: 1 });
                gsap.set(modalRef.current, { opacity: 1, y: 0, scale: 1 });
                return;
            }
            gsap.fromTo(overlayRef.current, 
                { opacity: 0 }, 
                { opacity: 1, duration: 0.2, ease: 'power2.out' }
            );
            
            gsap.fromTo(modalRef.current,
                { opacity: 0, y: 15, scale: 0.95 },
                { opacity: 1, y: 0, scale: 1, duration: 0.3, ease: 'back.out(1.2)' }
            );
        }
    }, { dependencies: [isOpen] });

    const handleClose = useCallback(() => {
        const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        if (prefersReducedMotion || !overlayRef.current || !modalRef.current) {
            onClose();
            return;
        }

        if (overlayRef.current && modalRef.current) {
            gsap.to(overlayRef.current, { opacity: 0, duration: 0.15, ease: 'power2.in' });
            gsap.to(modalRef.current, { 
                opacity: 0, 
                y: 10, 
                scale: 0.95, 
                duration: 0.15, 
                ease: 'power2.in',
                onComplete: onClose
            });
        } else {
            onClose();
        }
    }, [onClose]);

    useEffect(() => {
        if (!isOpen) {
            setCopied(false);
            setActiveShareTab('link');
            return undefined;
        }

        linkInputRef.current?.focus();
        const handleKeyDown = event => {
            if (event.key === 'Escape') handleClose();
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [handleClose, isOpen]);

    if (!isOpen) return null;

    const formUrl = `${window.location.origin}/f/${form.id}`;
    const embedCode = `<iframe src="${formUrl}" width="100%" height="600" frameborder="0" style="border:none;border-radius:24px;"></iframe>`;
    const accentColor = form?.settings?.accentColor || '#5b4ee8';

    const handleCopy = async (text) => {
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(text);
            } else {
                const copyInput = document.createElement('textarea');
                copyInput.value = text;
                copyInput.setAttribute('readonly', '');
                copyInput.style.position = 'fixed';
                copyInput.style.opacity = '0';
                document.body.appendChild(copyInput);
                copyInput.select();
                document.execCommand('copy');
                document.body.removeChild(copyInput);
            }
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            setCopied(false);
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6" style={{ zIndex: 99999 }} role="dialog" aria-modal="true" aria-labelledby="share-form-title">
            {/* Backdrop */}
            <div
                ref={overlayRef}
                className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm"
                onClick={handleClose}
            />

            {/* Modal */}
            <div ref={modalRef} tabIndex="-1" className="relative flex max-h-[min(760px,calc(100vh-1.5rem))] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_28px_80px_rgba(23,24,39,0.22)] sm:max-h-[min(760px,calc(100vh-3rem))] sm:rounded-[1.75rem]">
                {/* Header */}
                <div className="relative flex items-center justify-between border-b border-slate-100 px-5 py-5 sm:px-7 sm:py-6">
                    <div className="flex min-w-0 items-center gap-3">
                        <div className="h-10 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: accentColor }} aria-hidden="true" />
                        <div className="min-w-0">
                            <span className="eyebrow">Publish surface</span>
                            <h2 id="share-form-title" className="mt-1 truncate font-display text-xl font-bold tracking-tight text-[#171827]">Share {form.title || 'form'}</h2>
                        </div>
                    </div>
                    <button
                        onClick={handleClose}
                        aria-label="Close share dialog"
                        className="rounded-xl bg-slate-50 p-2 text-gray-400 transition-colors hover:bg-slate-100 hover:text-gray-900 focus-visible:ring-2 focus-visible:ring-[#5b4ee8]/40"
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>

                {/* Tab Buttons */}
                <div role="tablist" aria-label="Share options" className="flex gap-1 overflow-x-auto border-b border-gray-100 px-5 pt-1 sm:px-7 sm:pt-2">
                    {[
                        { id: 'link', label: 'Share Link', icon: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71' },
                        { id: 'embed', label: 'Embed Code', icon: 'M16 18l6-6-6-6M8 6l-6 6 6 6' },
                    ].map(tab => {
                        const isActive = activeShareTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                id={`${tab.id}-share-tab`}
                                role="tab"
                                aria-selected={isActive}
                                aria-controls={`${tab.id}-share-panel`}
                                onClick={() => { setActiveShareTab(tab.id); setCopied(false); }}
                                className={`flex shrink-0 items-center justify-center gap-2.5 border-b-[3px] px-2 pb-3.5 pt-1 text-[14px] font-bold transition-all ${
                                    isActive
                                        ? 'border-gray-900 text-gray-900'
                                        : 'border-transparent text-gray-400 hover:text-gray-600'
                                }`}
                            >
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d={tab.icon} />
                                </svg>
                                {tab.label}
                            </button>
                        );
                    })}
                </div>

                {/* Content */}
                <div className="min-h-[260px] overflow-y-auto p-5 sm:p-7">
                    {activeShareTab === 'link' && (
                        <div id="link-share-panel" role="tabpanel" aria-labelledby="link-share-tab" className="flex flex-col gap-5">
                            <div className="rounded-2xl border border-[#d9d5ff] bg-[#fafaff] p-5 sm:p-6">
                                <div className="mb-4 flex items-start gap-3">
                                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#eeeaff] text-[#5b4ee8]" aria-hidden="true">
                                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.71 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
                                    </div>
                                    <div>
                                        <h3 className="font-display text-base font-bold text-[#171827]">Public form link</h3>
                                        <p className="mt-1 text-sm leading-5 text-slate-500">Anyone with this link can open and submit your form.</p>
                                    </div>
                                </div>
                                <label htmlFor="public-form-url" className="mb-2 block text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">URL</label>
                                <div className="flex flex-col gap-2 sm:flex-row">
                                <input
                                    id="public-form-url"
                                    ref={linkInputRef}
                                    type="text"
                                    readOnly
                                    value={formUrl}
                                    aria-label="Public form URL"
                                    className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-[13px] font-medium text-slate-700 shadow-inner transition-all focus:border-[#5b4ee8] focus:outline-none focus:ring-4 focus:ring-[#5b4ee8]/10"
                                    onFocus={e => e.target.select()}
                                    onClick={e => e.target.select()}
                                />
                                <button
                                    onClick={() => handleCopy(formUrl)}
                                    aria-live="polite"
                                    className={`flex min-h-[48px] shrink-0 items-center justify-center gap-2 rounded-xl px-5 py-3 text-[14px] font-bold transition-all duration-300 shadow-sm ${
                                        copied
                                            ? 'bg-emerald-50 text-emerald-600 border border-emerald-200 shadow-inner'
                                            : 'text-white hover:opacity-90 hover:shadow-md'
                                    }`}
                                    style={!copied ? { backgroundColor: accentColor } : {}}
                                >
                                    {copied ? (
                                        <span className="flex items-center gap-2">
                                            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                                <polyline points="20 6 9 17 4 12" />
                                            </svg>
                                            Copied
                                        </span>
                                    ) : 'Copy Link'}
                                </button>
                                </div>
                                <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-semibold text-slate-500">
                                    <a href={formUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[#5b4ee8] hover:text-[#4e42d0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b4ee8]/40 rounded-md">
                                        Open public form
                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 17 17 7M7 7h10v10" /></svg>
                                    </a>
                                    <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-[#c8f17b]" aria-hidden="true" /> No sign-in required</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeShareTab === 'embed' && (
                        <div id="embed-share-panel" role="tabpanel" aria-labelledby="embed-share-tab" className="flex flex-col gap-4">
                            <p className="text-[15px] font-medium text-gray-500">Paste this code into your website's HTML to embed the form.</p>
                            <div className="relative group">
                                <pre className="max-h-40 overflow-auto rounded-2xl border border-gray-200 bg-gray-50/80 p-5 font-mono text-[12px] leading-relaxed text-gray-600 shadow-inner">
                                    {embedCode}
                                </pre>
                                <button
                                    onClick={() => handleCopy(embedCode)}
                                    aria-label="Copy embed code"
                                    className={`absolute right-3 top-3 rounded-xl px-4 py-2 text-[13px] font-bold transition-all duration-300 ${
                                        copied
                                            ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                                            : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-300 shadow-sm'
                                    }`}
                                >
                                    {copied ? 'Copied!' : 'Copy'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex flex-col items-start justify-between gap-3 border-t border-gray-100 bg-gray-50/50 px-5 py-4 sm:flex-row sm:items-center sm:px-7">
                    <div className="flex items-center gap-2 text-[12px] font-semibold text-gray-500">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="12" y1="16" x2="12" y2="12" />
                            <line x1="12" y1="8" x2="12.01" y2="8" />
                        </svg>
                        Anyone with the link can respond
                    </div>
                    <button
                        onClick={handleClose}
                        aria-label="Close share dialog"
                        className="text-[14px] font-bold text-gray-600 hover:text-gray-900 transition-colors px-4 py-2 hover:bg-gray-200/50 rounded-xl"
                    >
                        Done
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default FormShareModal;
