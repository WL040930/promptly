import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { Check, Code2, Copy, ExternalLink, Link2, Share2, X } from 'lucide-react';

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

    useEffect(() => {
        if (!isOpen) return undefined;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = previousOverflow; };
    }, [isOpen]);

    if (!isOpen) return null;

    const formUrl = `${window.location.origin}/f/${form.id}`;
    const embedCode = `<iframe src="${formUrl}" width="100%" height="600" frameborder="0" style="border:none;border-radius:24px;"></iframe>`;
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6" style={{ zIndex: 99999 }} role="dialog" aria-modal="true" aria-labelledby="share-form-title">
            {/* Backdrop */}
            <div
                ref={overlayRef}
                className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
                onClick={handleClose}
            />

            {/* Modal */}
            <div ref={modalRef} tabIndex="-1" className="relative flex max-h-[min(680px,calc(100vh-2rem))] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl sm:max-h-[min(680px,calc(100vh-3rem))]">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/80 px-5 py-4 sm:px-6">
                    <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-indigo-100 bg-indigo-50 text-indigo-600">
                            <Share2 className="h-5 w-5" strokeWidth={2.25} />
                        </div>
                        <div className="min-w-0">
                            <h2 id="share-form-title" className="truncate text-base font-bold text-slate-900">Share form</h2>
                            <p className="mt-0.5 truncate text-xs font-medium text-slate-500">{form.title || 'Untitled form'}</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={handleClose}
                        aria-label="Close share dialog"
                        className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                    >
                        <X className="h-5 w-5" strokeWidth={2.25} />
                    </button>
                </div>

                {/* Tab Buttons */}
                <div role="tablist" aria-label="Share options" className="flex items-center gap-1 border-b border-slate-200 bg-white px-5 py-2 sm:px-6">
                    {[
                        { id: 'link', label: 'Share link', Icon: Link2 },
                        { id: 'embed', label: 'Embed code', Icon: Code2 },
                    ].map(tab => {
                        const isActive = activeShareTab === tab.id;
                        const Icon = tab.Icon;
                        return (
                            <button
                                type="button"
                                key={tab.id}
                                id={`${tab.id}-share-tab`}
                                role="tab"
                                aria-selected={isActive}
                                aria-controls={`${tab.id}-share-panel`}
                                onClick={() => { setActiveShareTab(tab.id); setCopied(false); }}
                                className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
                                    isActive
                                        ? 'bg-indigo-50 text-indigo-700'
                                        : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
                                }`}
                            >
                                <Icon className="h-4 w-4" strokeWidth={2.25} />
                                {tab.label}
                            </button>
                        );
                    })}
                </div>

                {/* Content */}
                <div className="min-h-[270px] overflow-y-auto p-5 sm:p-6">
                    {activeShareTab === 'link' && (
                        <div id="link-share-panel" role="tabpanel" aria-labelledby="link-share-tab" className="space-y-5">
                            <div>
                                <h3 className="text-sm font-bold text-slate-900">Public link</h3>
                                <p className="mt-1 text-sm leading-5 text-slate-500">Send this link to collect responses. Anyone with it can open the form.</p>
                            </div>
                            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 sm:p-4">
                                <label htmlFor="public-form-url" className="mb-2 block text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Form link</label>
                                <div className="flex flex-col gap-2 sm:flex-row">
                                    <input
                                        id="public-form-url"
                                        ref={linkInputRef}
                                        type="text"
                                        readOnly
                                        value={formUrl}
                                        aria-label="Public form URL"
                                        className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10"
                                        onFocus={e => e.target.select()}
                                        onClick={e => e.target.select()}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => handleCopy(formUrl)}
                                        aria-live="polite"
                                        className={`inline-flex min-h-[42px] shrink-0 items-center justify-center gap-2 rounded-lg px-4 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
                                            copied ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-indigo-600 text-white hover:bg-indigo-700'
                                        }`}
                                    >
                                        {copied ? <><Check className="h-4 w-4" strokeWidth={2.75} />Copied</> : <><Copy className="h-4 w-4" strokeWidth={2.25} />Copy link</>}
                                    </button>
                                </div>
                            </div>
                            <a href={formUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 transition-colors hover:text-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400">
                                Open public form <ExternalLink className="h-3.5 w-3.5" strokeWidth={2.25} />
                            </a>
                        </div>
                    )}

                    {activeShareTab === 'embed' && (
                        <div id="embed-share-panel" role="tabpanel" aria-labelledby="embed-share-tab" className="space-y-5">
                            <div>
                                <h3 className="text-sm font-bold text-slate-900">Embed on a website</h3>
                                <p className="mt-1 text-sm leading-5 text-slate-500">Paste this snippet into your site’s HTML where the form should appear.</p>
                            </div>
                            <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-950">
                                <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
                                    <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">HTML iframe</span>
                                    <button
                                        type="button"
                                        onClick={() => handleCopy(embedCode)}
                                        aria-label="Copy embed code"
                                        className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
                                            copied ? 'bg-emerald-400/15 text-emerald-300' : 'bg-white/10 text-slate-200 hover:bg-white/15'
                                        }`}
                                    >
                                        {copied ? <><Check className="h-3.5 w-3.5" strokeWidth={2.75} />Copied</> : <><Copy className="h-3.5 w-3.5" strokeWidth={2.25} />Copy code</>}
                                    </button>
                                </div>
                                <pre className="max-h-44 overflow-auto p-4 font-mono text-xs leading-6 text-slate-200">
                                    {embedCode}
                                </pre>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-3 sm:px-6">
                    <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                        <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
                        Public access is enabled
                    </div>
                    <button
                        type="button"
                        onClick={handleClose}
                        className="rounded-lg px-3 py-2 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-200 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
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
