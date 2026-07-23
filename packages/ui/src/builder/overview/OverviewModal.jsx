import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { ICON_MAP } from '../utils/iconMap.jsx';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { WORKFLOW_MODAL_LAYERS } from '../modalLayers.js';

const COLOR_PRESETS = [
    { name: 'Indigo', bg: 'bg-indigo-100', text: 'text-indigo-600' },
    { name: 'Emerald', bg: 'bg-emerald-100', text: 'text-emerald-600' },
    { name: 'Rose', bg: 'bg-rose-100', text: 'text-rose-600' },
    { name: 'Amber', bg: 'bg-amber-100', text: 'text-amber-600' },
    { name: 'Blue', bg: 'bg-blue-100', text: 'text-blue-600' },
    { name: 'Purple', bg: 'bg-purple-100', text: 'text-purple-600' },
    { name: 'Slate', bg: 'bg-slate-100', text: 'text-slate-600' }
];

const OverviewModal = ({ config, inputValue, formData, isSubmitting, onInputChange, onFormDataChange, onCancel, onConfirm }) => {
    const overlayRef = useRef(null);
    const modalRef = useRef(null);

    useGSAP(() => {
        if (config && overlayRef.current && modalRef.current) {
            gsap.fromTo(overlayRef.current, 
                { opacity: 0 }, 
                { opacity: 1, duration: 0.2, ease: 'power2.out' }
            );
            
            gsap.fromTo(modalRef.current,
                { opacity: 0, y: 15, scale: 0.95 },
                { opacity: 1, y: 0, scale: 1, duration: 0.3, ease: 'back.out(1.2)' }
            );
        }
    }, { dependencies: [config] });

    const handleAction = (actionFn) => {
        if (overlayRef.current && modalRef.current) {
            gsap.to(overlayRef.current, { opacity: 0, duration: 0.15, ease: 'power2.in' });
            gsap.to(modalRef.current, { 
                opacity: 0, 
                y: 10, 
                scale: 0.95, 
                duration: 0.15, 
                ease: 'power2.in',
                onComplete: actionFn
            });
        } else {
            actionFn();
        }
    };

    const handleCancel = () => handleAction(onCancel);
    const handleConfirm = () => handleAction(onConfirm);

    if (!config) return null;

    return createPortal(
        <div className="fixed inset-0 z-[100000] flex items-center justify-center p-4" style={{ zIndex: WORKFLOW_MODAL_LAYERS.config }}>
            <div 
                ref={overlayRef}
                className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm"
                onClick={handleCancel}
            />
            <div ref={modalRef} className={`relative bg-white w-full ${config.showProperties ? 'max-w-md' : 'max-w-sm'} rounded-2xl shadow-2xl border border-slate-100 overflow-hidden`}>
                <div className="p-5">
                    <h3 className="text-lg font-semibold text-slate-900 mb-4">{config.title}</h3>

                    {config.showProperties ? (
                        <div className="flex flex-col gap-5">
                            {/* Name Input */}
                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Workflow Name</label>
                                <input
                                    type="text"
                                    autoFocus
                                    disabled={isSubmitting}
                                    value={formData.name || ''}
                                    onChange={(event) => onFormDataChange({ name: event.target.value })}
                                    onKeyDown={(event) => event.key === 'Enter' && !isSubmitting && handleConfirm()}
                                    placeholder="e.g. Lead Qualification"
                                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-50"
                                />
                            </div>

                            {/* Color Picker */}
                            <div className="flex flex-col gap-2">
                                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Color Theme</label>
                                <div className="flex items-center gap-2 flex-wrap">
                                    {COLOR_PRESETS.map((preset) => (
                                        <button
                                            key={preset.name}
                                            disabled={isSubmitting}
                                            onClick={() => onFormDataChange({ iconBg: preset.bg, iconColor: preset.text })}
                                            className={`w-8 h-8 rounded-full flex items-center justify-center transition-all disabled:opacity-50
                                                ${preset.bg} ${preset.text}
                                                ${formData.iconBg === preset.bg ? 'ring-2 ring-offset-2 ring-indigo-500 scale-110 shadow-md' : 'hover:scale-105 border border-transparent'}
                                            `}
                                            title={preset.name}
                                        >
                                            {formData.iconBg === preset.bg && (
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                                    <polyline points="20 6 9 17 4 12"></polyline>
                                                </svg>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Icon Picker */}
                            <div className="flex flex-col gap-2">
                                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Icon</label>
                                <div className="grid grid-cols-6 gap-2 max-h-[160px] overflow-y-auto p-1 -m-1">
                                    {Object.keys(ICON_MAP).map((iconKey) => {
                                        const isSelected = formData.icon === iconKey;
                                        return (
                                            <button
                                                key={iconKey}
                                                disabled={isSubmitting}
                                                onClick={() => onFormDataChange({ icon: iconKey })}
                                                className={`aspect-square flex items-center justify-center rounded-xl transition-all disabled:opacity-50
                                                    ${isSelected 
                                                        ? `${formData.iconBg} ${formData.iconColor} ring-1 ring-inset ring-indigo-500/30 shadow-sm scale-105` 
                                                        : 'bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-800 border border-slate-200/60 hover:border-slate-300'
                                                    }
                                                `}
                                                title={iconKey}
                                            >
                                                {ICON_MAP[iconKey]}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    ) : config.showInput ? (
                        <input
                            type="text"
                            autoFocus
                            disabled={isSubmitting}
                            value={inputValue}
                            onChange={(event) => onInputChange(event.target.value)}
                            onKeyDown={(event) => event.key === 'Enter' && !isSubmitting && handleConfirm()}
                            placeholder={config.placeholder}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-50"
                        />
                    ) : (
                        <p className="text-sm font-medium text-slate-500">{config.message}</p>
                    )}
                </div>

                <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
                    <button
                        onClick={handleCancel}
                        disabled={isSubmitting}
                        className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-200/50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={isSubmitting}
                        className={`flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed ${config.isDestructive
                                ? 'bg-red-600 hover:bg-red-700 hover:shadow-red-600/20'
                                : 'bg-indigo-600 hover:bg-indigo-700 hover:shadow-indigo-600/20'
                            }`}
                    >
                        {isSubmitting && (
                            <svg className="animate-spin -ml-1 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                        )}
                        {config.confirmLabel}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default OverviewModal;
