import React, { useRef } from 'react';
import { FIELD_TYPES, getTypesByCategory } from './fields/fieldTypes';
import TypeIcon from './fields/TypeIcon';
import { useClickOutside } from '../hooks/useClickOutside';

const AddFieldPopover = ({ 
    showAddMenu, 
    setShowAddMenu, 
    handleAddFieldOfType, 
    accentColor = '#4f46e5' 
}) => {
    const addMenuRef = useRef(null);
    useClickOutside(addMenuRef, showAddMenu, () => setShowAddMenu(false));

    return (
        <div className="relative flex flex-col items-center justify-center gap-4 mt-4">
            <div className="flex gap-3" ref={addMenuRef}>
                <button
                    onClick={() => setShowAddMenu(!showAddMenu)}
                    className="flex items-center gap-2.5 px-6 py-3.5 bg-white border border-gray-200 hover:border-gray-300 hover:shadow-lg rounded-full text-[15px] font-bold text-gray-700 transition-all duration-300 transform hover:-translate-y-1 group"
                >
                    <div className="w-6 h-6 rounded-full flex items-center justify-center transition-colors" style={{ backgroundColor: accentColor + '20', color: accentColor }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                    </div>
                    Add Question
                </button>

                {/* Add Question Type Picker Popover */}
                {showAddMenu && (
                    <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-4 w-80 bg-white/95 backdrop-blur-xl border border-gray-200 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.1)] z-50 overflow-hidden animate-slide-up-fade origin-bottom">
                        <div className="p-4 border-b border-gray-100/50 bg-gray-50/50 flex justify-between items-center">
                            <span className="text-[13px] font-bold text-gray-800">Add new block</span>
                            <button onClick={() => setShowAddMenu(false)} className="text-gray-400 hover:text-gray-600 p-1">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                                </svg>
                            </button>
                        </div>
                        <div className="max-h-[350px] overflow-y-auto p-2">
                            {getTypesByCategory().map(cat => (
                                <div key={cat.id} className="mb-2">
                                    <div className="px-3 py-2 text-[11px] font-extrabold uppercase tracking-widest text-gray-400">
                                        {cat.label}
                                    </div>
                                    <div className="grid grid-cols-2 gap-1 px-1">
                                        {cat.types.map(typeKey => {
                                            const tDef = FIELD_TYPES[typeKey];
                                            return (
                                                <button
                                                    key={typeKey}
                                                    onClick={() => handleAddFieldOfType(typeKey)}
                                                    className="flex flex-col items-center gap-2 p-3 rounded-2xl text-center transition-all hover:bg-gray-50 hover:scale-105"
                                                >
                                                    <div className="w-10 h-10 rounded-xl bg-white shadow-sm border border-gray-100 flex items-center justify-center text-gray-600">
                                                        <TypeIcon typeName={typeKey} size={18} />
                                                    </div>
                                                    <span className="text-[12px] font-bold text-gray-700">{tDef.label}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AddFieldPopover;
