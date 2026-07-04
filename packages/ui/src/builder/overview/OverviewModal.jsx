import React from 'react';

const OverviewModal = ({ config, inputValue, isSubmitting, onInputChange, onCancel, onConfirm }) => {
    if (!config) return null;

    return (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/30 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl border border-slate-100 overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-5">
                    <h3 className="text-lg font-semibold text-slate-900">{config.title}</h3>

                    <div className="mt-3">
                        {config.showInput ? (
                            <input
                                type="text"
                                autoFocus
                                disabled={isSubmitting}
                                value={inputValue}
                                onChange={(event) => onInputChange(event.target.value)}
                                onKeyDown={(event) => event.key === 'Enter' && !isSubmitting && onConfirm()}
                                placeholder={config.placeholder}
                                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-50"
                            />
                        ) : (
                            <p className="text-sm font-medium text-slate-500">{config.message}</p>
                        )}
                    </div>
                </div>

                <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
                    <button
                        onClick={onCancel}
                        disabled={isSubmitting}
                        className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-200/50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
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
        </div>
    );
};

export default OverviewModal;
