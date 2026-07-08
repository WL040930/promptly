import React, { useMemo, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import FieldRenderer from './fields/FieldRenderer';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';

const FormDiffPreviewModal = ({ isOpen, onClose, currentForm, proposal }) => {
    // Prevent background scrolling when open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => {
            document.body.style.overflow = '';
        };
    }, [isOpen]);

    const overlayRef = useRef(null);
    const modalRef = useRef(null);

    useGSAP(() => {
        if (isOpen && overlayRef.current && modalRef.current) {
            // Animate overlay fading in
            gsap.fromTo(overlayRef.current, 
                { opacity: 0 }, 
                { opacity: 1, duration: 0.3, ease: 'power2.out' }
            );
            
            // Animate modal sliding up and scaling slightly
            gsap.fromTo(modalRef.current,
                { opacity: 0, y: 30, scale: 0.95 },
                { opacity: 1, y: 0, scale: 1, duration: 0.4, ease: 'back.out(1.2)', delay: 0.05 }
            );
        }
    }, { dependencies: [isOpen] });

    const handleClose = useCallback(() => {
        if (overlayRef.current && modalRef.current) {
            gsap.to(overlayRef.current, { opacity: 0, duration: 0.2, ease: 'power2.in' });
            gsap.to(modalRef.current, { 
                opacity: 0, 
                y: 20, 
                scale: 0.95, 
                duration: 0.2, 
                ease: 'power2.in',
                onComplete: onClose
            });
        } else {
            onClose();
        }
    }, [onClose]);

    const patches = proposal?.patches || [];
    const proposedSchema = proposal?.schema || {};
    const metaUpdate = patches.find(p => p.op === 'update_meta');

    const diffFields = useMemo(() => {
        if (!proposal) return [];
        const list = [];
        
        // 1. Render all proposed fields in order
        for (const field of (proposedSchema.fields || [])) {
            const patch = patches.find(p => (p.op === 'update' && p.id === field.id) || (p.op === 'add' && p.field?.id === field.id));
            if (patch) {
                list.push({ ...field, _diffStatus: patch.op === 'add' ? 'added' : 'updated' });
            } else {
                list.push({ ...field, _diffStatus: 'unchanged' });
            }
        }

        // 2. Append removed fields at the end so they are visible
        const removes = patches.filter(p => p.op === 'remove');
        for (const patch of removes) {
            const originalField = currentForm?.fields?.find(f => f.id === patch.id) || { id: patch.id, type: 'text', label: patch.label || 'Removed Field' };
            list.push({ ...originalField, _diffStatus: 'removed' });
        }

        return list;
    }, [currentForm, proposal, patches, proposedSchema]);

    if (!isOpen || !proposal) return null;

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6" style={{ zIndex: 99999 }}>
            {/* Overlay */}
            <div 
                ref={overlayRef}
                className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
                onClick={handleClose}
            ></div>

            {/* Modal Box */}
            <div ref={modalRef} className="relative bg-slate-50 w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
                
                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-200 bg-white flex items-center justify-between shrink-0">
                    <div>
                        <h2 className="text-lg font-bold text-slate-800">Preview Changes</h2>
                        <p className="text-xs text-slate-500 font-medium mt-0.5">Review exactly how the AI will modify your form canvas.</p>
                    </div>
                    <button 
                        onClick={handleClose}
                        className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>

                {/* Content Body (Scrollable) */}
                <div className="flex-1 overflow-y-auto p-6 sm:p-10">
                    <div className="max-w-2xl mx-auto bg-white border border-slate-200 shadow-sm rounded-xl p-8">
                        
                        {/* Form Title & Description */}
                        <div className={`mb-10 pb-6 border-b border-slate-100 p-4 rounded-xl -mx-4 -mt-4 ${metaUpdate ? 'bg-amber-50/40 border border-amber-200' : ''}`}>
                            {metaUpdate && (
                                <div className="text-[10px] font-bold text-amber-600 uppercase tracking-wider mb-2">~ Form Properties Modified</div>
                            )}
                            <h1 className="text-3xl font-black text-slate-900 tracking-tight">{proposedSchema.title || 'Untitled Form'}</h1>
                            {proposedSchema.description && (
                                <p className="text-base text-slate-500 mt-2 font-medium">{proposedSchema.description}</p>
                            )}
                        </div>

                        {/* Form Fields */}
                        <div className="flex flex-col gap-8">
                            {diffFields.map((field) => {
                                let wrapperClass = "relative p-4 -mx-4 rounded-xl border border-transparent transition-colors";
                                let tag = null;

                                if (field._diffStatus === 'added') {
                                    wrapperClass = "relative p-4 -mx-4 rounded-xl bg-emerald-50 border-2 border-emerald-400 shadow-sm";
                                    tag = <span className="absolute -top-3 left-4 bg-emerald-100 text-emerald-800 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border border-emerald-300">+ Added</span>;
                                } else if (field._diffStatus === 'updated') {
                                    wrapperClass = "relative p-4 -mx-4 rounded-xl bg-amber-50 border-2 border-amber-400 shadow-sm";
                                    tag = <span className="absolute -top-3 left-4 bg-amber-100 text-amber-800 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border border-amber-300">~ Modified</span>;
                                } else if (field._diffStatus === 'removed') {
                                    wrapperClass = "relative p-4 -mx-4 rounded-xl bg-red-50 border-2 border-red-400 opacity-80 shadow-sm";
                                    tag = <span className="absolute -top-3 left-4 bg-red-100 text-red-800 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border border-red-300">- Removed</span>;
                                }

                                return (
                                    <div key={field.id} className={wrapperClass}>
                                        {tag}
                                        <div className={field._diffStatus === 'removed' ? 'pointer-events-none grayscale opacity-60 line-through' : 'pointer-events-none'}>
                                            <FieldRenderer 
                                                field={field} 
                                                value="" 
                                                onChange={() => {}} 
                                                accentColor="#4f46e5"
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-slate-200 bg-white flex justify-end shrink-0">
                    <button 
                        onClick={handleClose}
                        className="px-6 py-2 bg-slate-900 text-white rounded-xl text-sm font-bold hover:bg-slate-800 transition-colors"
                    >
                        Done
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default FormDiffPreviewModal;
