import React, { useState, useRef, useCallback } from 'react';
import { FIELD_TYPES, getTypesByCategory } from './fieldTypes';
import TypeIcon from './TypeIcon';
import FieldSettingsPanel from './FieldSettingsPanel';
import Switch from '../../../components/ui/Switch.jsx';

// ---------------------------------------------------------------------------
// useClickOutside — closes a dropdown when clicking outside its ref
// ---------------------------------------------------------------------------

const useClickOutside = (ref, isOpen, onClose) => {
    React.useEffect(() => {
        if (!isOpen) return;
        const handler = (e) => {
            if (ref.current && !ref.current.contains(e.target)) onClose();
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [isOpen, onClose, ref]);
};

// ---------------------------------------------------------------------------
// FieldPreview — read-only preview shown when the card is not selected
// ---------------------------------------------------------------------------

const FieldPreview = ({ field }) => {
    const { type } = field;

    if (['text', 'email', 'number', 'phone', 'url'].includes(type)) {
        return (
            <div className="h-10 bg-gray-50/50 border border-gray-200 rounded-xl w-full max-w-md flex items-center px-4">
                <span className="text-gray-400 text-[13px]">{field.placeholder || '...'}</span>
            </div>
        );
    }
    if (type === 'textarea') {
        return (
            <div className="h-20 bg-gray-50/50 border border-gray-200 rounded-xl w-full max-w-md p-4">
                <span className="text-gray-400 text-[13px]">{field.placeholder || '...'}</span>
            </div>
        );
    }
    if (type === 'select') {
        return (
            <div className="h-10 bg-gray-50/50 border border-gray-200 rounded-xl w-full max-w-md flex items-center px-4 justify-between">
                <span className="text-gray-400 text-[13px]">Select an option...</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2.5"><path d="M6 9l6 6 6-6" /></svg>
            </div>
        );
    }
    if (['radio', 'checkbox'].includes(type)) {
        return (
            <div className="flex flex-col gap-2.5 mt-2">
                {(field.choices || ['Option 1', 'Option 2']).slice(0, 3).map((c, i) => (
                    <div key={i} className="flex items-center gap-3">
                        <div className={`w-4 h-4 border-2 border-gray-300 ${type === 'radio' ? 'rounded-full' : 'rounded-md'} bg-white`} />
                        <span className="text-[14px] text-gray-500 font-medium">{c}</span>
                    </div>
                ))}
                {(field.choices || []).length > 3 && (
                    <span className="text-[13px] text-gray-400 italic ml-7">+{field.choices.length - 3} more</span>
                )}
            </div>
        );
    }
    if (type === 'rating') {
        return (
            <div className="flex gap-1.5 mt-1">
                {Array.from({ length: field.maxRating || 5 }).map((_, i) => (
                    <svg key={i} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="2">
                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                    </svg>
                ))}
            </div>
        );
    }
    if (type === 'file') {
        return (
            <div className="h-16 border-2 border-dashed border-gray-200 rounded-xl w-full max-w-md flex flex-col items-center justify-center bg-gray-50/30">
                <svg className="text-gray-400 mb-1" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
                </svg>
            </div>
        );
    }
    if (type === 'date') {
        return (
            <div className="h-10 bg-gray-50/50 border border-gray-200 rounded-xl w-full max-w-md flex items-center px-4">
                <span className="text-gray-400 text-[13px]">mm/dd/yyyy</span>
            </div>
        );
    }
    if (type === 'time') {
        return (
            <div className="h-10 bg-gray-50/50 border border-gray-200 rounded-xl w-full max-w-md flex items-center px-4">
                <span className="text-gray-400 text-[13px]">--:-- --</span>
            </div>
        );
    }
    return null;
};

// ---------------------------------------------------------------------------
// TypeSelectorDropdown — the floating dropdown for choosing a field type
// ---------------------------------------------------------------------------

const TypeSelectorDropdown = ({ currentType, onSelect }) => (
    <div className="absolute right-0 top-full mt-2 w-64 bg-white/95 backdrop-blur-xl border border-gray-200 rounded-2xl shadow-2xl z-50 overflow-hidden animate-slide-up-fade">
        <div className="max-h-80 overflow-y-auto py-2">
            {getTypesByCategory().map((cat) => (
                <div key={cat.id} className="mb-1">
                    <div className="px-4 py-2 text-[11px] font-extrabold uppercase tracking-widest text-gray-400">
                        {cat.label}
                    </div>
                    <div className="px-1.5">
                        {cat.types.map((typeKey) => {
                            const tDef = FIELD_TYPES[typeKey];
                            const isActive = currentType === typeKey;
                            return (
                                <button
                                    key={typeKey}
                                    onClick={(e) => { e.stopPropagation(); onSelect(typeKey, tDef.defaults || {}); }}
                                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-sm transition-all ${
                                        isActive
                                            ? 'bg-gray-100 text-gray-900 font-bold'
                                            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 font-medium'
                                    }`}
                                >
                                    <div className={`p-1.5 rounded-lg ${isActive ? 'bg-white shadow-sm' : ''}`}>
                                        <TypeIcon typeName={typeKey} size={16} />
                                    </div>
                                    <span>{tDef.label}</span>
                                    {isActive && (
                                        <svg className="ml-auto text-gray-900" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                            <polyline points="20 6 9 17 4 12" />
                                        </svg>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>
            ))}
        </div>
    </div>
);

// ---------------------------------------------------------------------------
// DragHandle
// ---------------------------------------------------------------------------

const DragHandle = () => (
    <div
        className="flex items-center justify-center w-10 shrink-0 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 transition-colors group-hover:opacity-100 opacity-60"
        title="Drag to reorder"
    >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="9" cy="5" r="1.5" /><circle cx="15" cy="5" r="1.5" />
            <circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
            <circle cx="9" cy="19" r="1.5" /><circle cx="15" cy="19" r="1.5" />
        </svg>
    </div>
);

// ---------------------------------------------------------------------------
// FieldCard — the main editor card
// ---------------------------------------------------------------------------

/**
 * FieldCard — individual field builder card shown in the form editor.
 * Upgraded with premium design: glassmorphism hints, glowing borders, smooth transitions.
 */
const FieldCard = ({
    field,
    isSelected,
    onSelect,
    onUpdate,
    onDelete,
    onDuplicate,
    onDragStart,
    onDragOver,
    onDrop,
    accentColor = '#5b4ee8',
}) => {
    const [isTypeSelectorOpen, setIsTypeSelectorOpen] = useState(false);
    const typeSelectorRef = useRef(null);

    const closeTypeSelector = useCallback(() => setIsTypeSelectorOpen(false), []);
    useClickOutside(typeSelectorRef, isTypeSelectorOpen, closeTypeSelector);

    const typeDef = FIELD_TYPES[field.type] || FIELD_TYPES.text;
    const isHeading = field.type === 'heading';
    const hasChoices = ['select', 'radio', 'checkbox'].includes(field.type);

    // -- Choice handlers --
    const handleAddChoice = () =>
        onUpdate({ choices: [...(field.choices || []), `Option ${(field.choices || []).length + 1}`] });

    const handleUpdateChoice = (index, value) => {
        const choices = [...(field.choices || [])];
        choices[index] = value;
        onUpdate({ choices });
    };

    const handleDeleteChoice = (index) => {
        if ((field.choices || []).length <= 1) return;
        onUpdate({ choices: (field.choices || []).filter((_, i) => i !== index) });
    };

    return (
        <div
            draggable
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDrop={onDrop}
            onClick={onSelect}
            className={`relative bg-white rounded-2xl cursor-pointer group animate-slide-up-fade ${
                isSelected ? 'form-card-active z-10' : 'form-card-inactive'
            }`}
            style={{
                borderLeftColor: isSelected ? accentColor : 'transparent',
                '--accent-light': accentColor + '08',
            }}
        >
            <div className="flex">
                <DragHandle />

                {/* Main content */}
                <div className="flex-1 py-5 pr-6 flex flex-col gap-4 min-w-0">

                    {/* Row 1: Label + type selector */}
                    <div className="flex items-start gap-4 flex-wrap">
                        <input
                            type="text"
                            value={field.label}
                            onChange={(e) => onUpdate({ label: e.target.value })}
                            placeholder={isHeading ? 'Section Title' : 'Question text'}
                            className={
                                isHeading
                                    ? 'flex-1 min-w-[200px] text-xl font-bold text-gray-900 bg-transparent border-b-2 border-transparent hover:border-gray-200 focus:border-gray-400 focus:outline-none py-1 transition-all'
                                    : `flex-1 min-w-[200px] text-[15px] font-semibold text-gray-800 bg-transparent border-b-2 border-transparent hover:border-gray-200 focus:border-gray-400 focus:outline-none py-1 transition-all ${isSelected ? 'bg-white/50 rounded px-2 -mx-2' : ''}`
                            }
                        />

                        {/* Type selector */}
                        <div className="relative" ref={typeSelectorRef}>
                            <button
                                onClick={(e) => { e.stopPropagation(); setIsTypeSelectorOpen((o) => !o); }}
                                aria-expanded={isTypeSelectorOpen}
                                aria-haspopup="listbox"
                                aria-label={`Change field type, currently ${typeDef.label}`}
                                className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-[13px] font-bold transition-all shadow-sm ${
                                    isSelected
                                        ? 'bg-white border-gray-200 hover:border-gray-300 hover:shadow text-gray-700'
                                        : 'bg-gray-50 border-gray-100 text-gray-500 hover:bg-gray-100'
                                }`}
                            >
                                <TypeIcon typeName={field.type} size={15} />
                                <span>{typeDef.label}</span>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                    <path d="M6 9l6 6 6-6" />
                                </svg>
                            </button>

                            {isTypeSelectorOpen && (
                                <TypeSelectorDropdown
                                    currentType={field.type}
                                    onSelect={(typeKey, defaults) => {
                                        onUpdate({ type: typeKey, ...defaults });
                                        setIsTypeSelectorOpen(false);
                                    }}
                                />
                            )}
                        </div>
                    </div>

                    {/* Heading subtext */}
                    {isHeading && (
                        <input
                            type="text"
                            value={field.subtext || ''}
                            onChange={(e) => onUpdate({ subtext: e.target.value })}
                            placeholder="Description (optional)"
                            className="text-[15px] text-gray-500 bg-transparent border-b border-transparent hover:border-gray-200 focus:border-gray-400 focus:outline-none py-1 transition-all"
                        />
                    )}

                    {/* Unselected preview */}
                    {!isSelected && !isHeading && (
                        <div className="mt-1 opacity-60 pointer-events-none select-none transition-all duration-300">
                            <FieldPreview field={field} />
                        </div>
                    )}

                    {/* Settings panel (placeholder, choices, min/max, etc.) */}
                    <FieldSettingsPanel
                        field={field}
                        isSelected={isSelected}
                        hasChoices={hasChoices}
                        onUpdate={onUpdate}
                        handleAddChoice={handleAddChoice}
                        handleUpdateChoice={handleUpdateChoice}
                        handleDeleteChoice={handleDeleteChoice}
                    />

                    {/* Bottom toolbar */}
                    <div className={`flex items-center justify-between border-t border-gray-100 pt-4 mt-2 transition-opacity duration-300 ${
                        isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                    }`}>
                        {/* Required toggle */}
                        {!isHeading ? (
                            <label className="flex items-center gap-3 cursor-pointer select-none group/req">
                                <span className="text-[13px] text-gray-500 font-bold group-hover/req:text-gray-700 transition-colors">Required</span>
                                <Switch
                                    size="md"
                                    checked={field.required}
                                    onChange={(val) => onUpdate({ required: val })}
                                    activeColor={accentColor}
                                />
                            </label>
                        ) : (
                            <div />
                        )}

                        {/* Action buttons */}
                        <div className="flex items-center gap-1.5">
                            <button
                                onClick={(e) => { e.stopPropagation(); onDuplicate(); }}
                                className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-all"
                                title="Duplicate"
                                aria-label={`Duplicate ${field.label || 'field'}`}
                            >
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                </svg>
                            </button>
                            <div className="w-px h-6 bg-gray-200 mx-1" />
                            <button
                                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                                title="Delete"
                                aria-label={`Delete ${field.label || 'field'}`}
                            >
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                    <polyline points="3 6 5 6 21 6" />
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default FieldCard;
