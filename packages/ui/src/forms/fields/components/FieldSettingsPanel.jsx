import React from 'react';

const FieldSettingsPanel = ({
    field,
    isSelected,
    hasChoices,
    onUpdate,
    handleAddChoice,
    handleUpdateChoice,
    handleDeleteChoice
}) => {
    if (!isSelected) return null;

    return (
        <>
            {/* Placeholder input */}
            {['text', 'email', 'number', 'phone', 'url', 'textarea'].includes(field.type) && (
                <input
                    type="text"
                    value={field.placeholder || ''}
                    onChange={e => onUpdate({ placeholder: e.target.value })}
                    placeholder="Placeholder text (optional)"
                    className="text-[13px] font-medium text-gray-500 bg-gray-50/50 border border-gray-200 rounded-xl px-4 py-2.5 focus:outline-none focus:border-gray-300 focus:bg-white transition-all shadow-inner"
                />
            )}

            {/* Textarea rows */}
            {field.type === 'textarea' && (
                <div className="flex items-center gap-3 mt-1">
                    <span className="text-[13px] text-gray-500 font-semibold">Rows</span>
                    <input
                        type="number"
                        value={field.rows || 4}
                        onChange={e => onUpdate({ rows: parseInt(e.target.value) || 4 })}
                        className="w-24 text-[13px] font-medium bg-gray-50/50 border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-gray-300 focus:bg-white shadow-inner"
                        min="2"
                        max="20"
                    />
                </div>
            )}

            {/* Number min/max */}
            {field.type === 'number' && (
                <div className="flex gap-4">
                    <div className="flex items-center gap-2">
                        <span className="text-[13px] text-gray-500 font-semibold">Min</span>
                        <input
                            type="number"
                            value={field.min || ''}
                            onChange={e => onUpdate({ min: e.target.value })}
                            className="w-24 text-[13px] font-medium bg-gray-50/50 border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-gray-300 focus:bg-white shadow-inner"
                            placeholder="—"
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-[13px] text-gray-500 font-semibold">Max</span>
                        <input
                            type="number"
                            value={field.max || ''}
                            onChange={e => onUpdate({ max: e.target.value })}
                            className="w-24 text-[13px] font-medium bg-gray-50/50 border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-gray-300 focus:bg-white shadow-inner"
                            placeholder="—"
                        />
                    </div>
                </div>
            )}

            {/* Rating max */}
            {field.type === 'rating' && (
                <div className="flex items-center gap-3">
                    <span className="text-[13px] text-gray-500 font-semibold">Max rating</span>
                    <select
                        value={field.maxRating || 5}
                        onChange={e => onUpdate({ maxRating: parseInt(e.target.value) })}
                        className="text-[13px] font-medium bg-gray-50/50 border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-gray-300 focus:bg-white shadow-inner cursor-pointer"
                    >
                        {[3, 4, 5, 7, 10].map(n => (
                            <option key={n} value={n}>{n} stars</option>
                        ))}
                    </select>
                </div>
            )}

            {/* File accept */}
            {field.type === 'file' && (
                <input
                    type="text"
                    value={field.accept || ''}
                    onChange={e => onUpdate({ accept: e.target.value })}
                    placeholder="Accepted types (e.g. .pdf,.jpg)"
                    className="text-[13px] font-medium text-gray-500 bg-gray-50/50 border border-gray-200 rounded-xl px-4 py-2.5 focus:outline-none focus:border-gray-300 focus:bg-white shadow-inner transition-all"
                />
            )}

            {/* Hidden field value */}
            {field.type === 'hidden' && (
                <input
                    type="text"
                    value={field.defaultValue || ''}
                    onChange={e => onUpdate({ defaultValue: e.target.value })}
                    placeholder="Default value"
                    className="text-[13px] font-medium text-gray-500 bg-gray-50/50 border border-gray-200 rounded-xl px-4 py-2.5 focus:outline-none focus:border-gray-300 focus:bg-white shadow-inner transition-all"
                />
            )}

            {/* Choices Editor */}
            {hasChoices && (
                <div className="flex flex-col gap-2.5 mt-2">
                    {(field.choices || []).map((choice, index) => (
                        <div key={index} className="flex items-center gap-3 group/choice">
                            {/* Visual indicator */}
                            {field.type === 'radio' && (
                                <div className="w-5 h-5 rounded-full border-2 border-gray-300 bg-gray-50 shrink-0" />
                            )}
                            {field.type === 'checkbox' && (
                                <div className="w-5 h-5 rounded-md border-2 border-gray-300 bg-gray-50 shrink-0" />
                            )}
                            {field.type === 'select' && (
                                <span className="text-[13px] text-gray-400 font-bold w-5 shrink-0 text-center">{index + 1}.</span>
                            )}

                            <input
                                type="text"
                                value={choice}
                                onChange={e => handleUpdateChoice(index, e.target.value)}
                                className="flex-1 text-[15px] font-medium text-gray-800 bg-transparent border-b-2 border-transparent hover:border-gray-200 focus:border-gray-400 focus:outline-none py-1 transition-all"
                            />
                            {(field.choices || []).length > 1 && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); handleDeleteChoice(index); }}
                                    className="opacity-0 group-hover/choice:opacity-100 text-gray-300 hover:text-red-500 p-1.5 hover:bg-red-50 rounded-lg transition-all"
                                    title="Remove option"
                                >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                                    </svg>
                                </button>
                            )}
                        </div>
                    ))}
                    <button
                        onClick={(e) => { e.stopPropagation(); handleAddChoice(); }}
                        className="flex items-center gap-2 text-[13px] font-bold text-gray-400 hover:text-gray-700 mt-2 self-start transition-colors px-2 py-1.5 hover:bg-gray-50 rounded-lg"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                        Add option
                    </button>
                </div>
            )}
        </>
    );
};

export default FieldSettingsPanel;
