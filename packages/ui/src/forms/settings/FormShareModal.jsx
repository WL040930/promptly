import { useState, useRef, useEffect } from 'react';
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

    const handleClose = () => {
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
    };

    useEffect(() => {
        if (!isOpen) {
            setCopied(false);
            setActiveShareTab('link');
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const formUrl = `${window.location.origin}/f/${form.id}`;
    const embedCode = `<iframe src="${formUrl}" width="100%" height="600" frameborder="0" style="border:none;border-radius:24px;"></iframe>`;
    const accentColor = form?.settings?.accentColor || '#4f46e5';

    const handleCopy = (text) => {
        navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ zIndex: 99999 }}>
            {/* Backdrop */}
            <div
                ref={overlayRef}
                className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm"
                onClick={handleClose}
            />

            {/* Modal */}
            <div ref={modalRef} className="relative w-full max-w-lg bg-white rounded-[2rem] shadow-2xl overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-8 py-6">
                    <h2 className="text-xl font-extrabold text-gray-900 tracking-tight">Share Form</h2>
                    <button
                        onClick={handleClose}
                        className="p-2 text-gray-400 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 rounded-full transition-colors"
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>

                {/* Tab Buttons */}
                <div className="flex px-8 border-b border-gray-100">
                    {[
                        { id: 'link', label: 'Share Link', icon: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71' },
                        { id: 'embed', label: 'Embed Code', icon: 'M16 18l6-6-6-6M8 6l-6 6 6 6' },
                    ].map(tab => {
                        const isActive = activeShareTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => { setActiveShareTab(tab.id); setCopied(false); }}
                                className={`flex items-center justify-center gap-2.5 pb-4 px-2 text-[15px] font-bold transition-all border-b-[3px] mr-8 ${
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
                <div className="p-8 min-h-[220px]">
                    {activeShareTab === 'link' && (
                        <div className="flex flex-col gap-4">
                            <p className="text-[15px] font-medium text-gray-500">Share this link with anyone to let them fill out your form.</p>
                            <div className="flex flex-col sm:flex-row gap-3">
                                <input
                                    ref={linkInputRef}
                                    type="text"
                                    readOnly
                                    value={formUrl}
                                    className="flex-1 bg-gray-50/80 border border-gray-200 rounded-2xl px-5 py-4 text-[15px] text-gray-700 font-mono focus:outline-none focus:border-gray-400 focus:bg-white transition-all shadow-inner"
                                    onClick={e => e.target.select()}
                                />
                                <button
                                    onClick={() => handleCopy(formUrl)}
                                    className={`shrink-0 px-8 py-4 rounded-2xl text-[15px] font-bold transition-all duration-300 shadow-sm ${
                                        copied
                                            ? 'bg-emerald-50 text-emerald-600 border border-emerald-200 shadow-inner'
                                            : 'text-white hover:opacity-90 hover:shadow-md'
                                    }`}
                                    style={!copied ? { backgroundColor: accentColor } : {}}
                                >
                                    {copied ? (
                                        <span className="flex items-center gap-2">
                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                                <polyline points="20 6 9 17 4 12" />
                                            </svg>
                                            Copied
                                        </span>
                                    ) : 'Copy Link'}
                                </button>
                            </div>
                        </div>
                    )}

                    {activeShareTab === 'embed' && (
                        <div className="flex flex-col gap-4">
                            <p className="text-[15px] font-medium text-gray-500">Paste this code into your website's HTML to embed the form.</p>
                            <div className="relative group">
                                <pre className="bg-gray-50/80 border border-gray-200 rounded-2xl p-5 text-[13px] text-gray-600 font-mono overflow-x-auto leading-relaxed whitespace-pre-wrap break-all shadow-inner h-[120px]">
                                    {embedCode}
                                </pre>
                                <button
                                    onClick={() => handleCopy(embedCode)}
                                    className={`absolute top-3 right-3 px-4 py-2 rounded-xl text-[13px] font-bold transition-all duration-300 ${
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
                <div className="px-8 py-5 border-t border-gray-100 bg-gray-50/50 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-[13px] font-bold text-gray-500">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="12" y1="16" x2="12" y2="12" />
                            <line x1="12" y1="8" x2="12.01" y2="8" />
                        </svg>
                        Anyone with the link can respond
                    </div>
                    <button
                        onClick={handleClose}
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
