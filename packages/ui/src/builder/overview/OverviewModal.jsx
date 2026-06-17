import React from 'react';

const OverviewModal = ({ config, inputValue, onInputChange, onCancel, onConfirm }) => {
    if (!config) return null;

    return (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/30 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl border border-slate-100 overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-5">
                    <h3 className="text-lg font-bold text-slate-900">{config.title}</h3>

                    <div className="mt-3">
                        {config.showInput ? (
                            <input
                                type="text"
                                autoFocus
                                value={inputValue}
                                onChange={(event) => onInputChange(event.target.value)}
                                onKeyDown={(event) => event.key === 'Enter' && onConfirm()}
                                placeholder={config.placeholder}
                                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                            />
                        ) : (
                            <p className="text-sm font-medium text-slate-500">{config.message}</p>
                        )}
                    </div>
                </div>

                <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 text-sm font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-200/50 rounded-lg transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        className={`px-4 py-2 text-sm font-bold text-white rounded-lg transition-all shadow-sm ${config.isDestructive
                                ? 'bg-red-600 hover:bg-red-700 hover:shadow-red-600/20'
                                : 'bg-blue-600 hover:bg-blue-700 hover:shadow-blue-600/20'
                            }`}
                    >
                        {config.confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default OverviewModal;
