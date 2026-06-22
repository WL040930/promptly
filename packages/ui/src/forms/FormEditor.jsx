import React, { useState, useRef } from 'react';
import FieldCard from './fields/FieldCard';
import { FIELD_TYPES, getTypesByCategory, createField } from './fields/fieldTypes';

import { useClickOutside } from './hooks/useClickOutside';
import TypeIcon from './fields/TypeIcon';

/**
 * FormEditor — the design-mode editor view.
 * Redesigned with premium header card, glassmorphism UI, and animated add button.
 */

const FormEditor = ({
    form,
    onUpdateForm,
    onUpdateField,
    onDeleteField,
    onDuplicateField,
    onAddField,
    onReorderFields,
    accentColor = '#4f46e5',
}) => {
    const [selectedFieldId, setSelectedFieldId] = useState(null);
    const [showAddMenu, setShowAddMenu] = useState(false);
    const addMenuRef = useRef(null);
    const dragIndexRef = useRef(null);

    useClickOutside(addMenuRef, showAddMenu, () => setShowAddMenu(false));

    const handleDragStart = (index) => (e) => {
        dragIndexRef.current = index;
        e.dataTransfer.effectAllowed = 'move';
        const img = new Image();
        img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
        e.dataTransfer.setDragImage(img, 0, 0);
    };

    const handleDragOver = (index) => (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    const handleDrop = (targetIndex) => (e) => {
        e.preventDefault();
        const fromIndex = dragIndexRef.current;
        if (fromIndex === null || fromIndex === targetIndex) return;
        onReorderFields(fromIndex, targetIndex);
        dragIndexRef.current = null;
    };

    const handleAddFieldOfType = (type) => {
        const newField = createField(type);
        onAddField(newField);
        setSelectedFieldId(newField.id);
        setShowAddMenu(false);
    };



    return (
        <div className="flex flex-col gap-6 pb-16">
            {/* Form Header Card */}
            <div
                className="bg-white rounded-2xl overflow-hidden shadow-sm relative transition-all duration-300"
            >
                {/* Accent top gradient line */}
                <div className="h-3 w-full" style={{ background: `linear-gradient(90deg, ${accentColor}, ${accentColor}80)` }} />
                
                <div className="p-8 flex flex-col gap-3">
                    <input
                        type="text"
                        value={form.title}
                        onChange={e => onUpdateForm({ title: e.target.value })}
                        placeholder="Form Title"
                        className="text-3xl font-extrabold text-gray-900 bg-transparent border-b-2 border-transparent hover:border-gray-200 focus:border-gray-400 focus:outline-none py-1.5 transition-all w-full placeholder:text-gray-400 tracking-tight"
                    />
                    <textarea
                        value={form.description || ''}
                        onChange={e => onUpdateForm({ description: e.target.value })}
                        placeholder="Add a description to explain the purpose of this form..."
                        rows={2}
                        className="text-[15px] font-medium text-gray-600 bg-transparent border-b-2 border-transparent hover:border-gray-200 focus:border-gray-400 focus:outline-none py-1.5 transition-all w-full resize-none leading-relaxed placeholder:text-gray-500"
                    />
                </div>
            </div>

            {/* Field Cards */}
            <div className="flex flex-col gap-4">
                {form.fields.map((field, index) => (
                    <FieldCard
                        key={field.id}
                        field={field}
                        isSelected={selectedFieldId === field.id}
                        onSelect={() => setSelectedFieldId(field.id)}
                        onUpdate={(updates) => onUpdateField(field.id, updates)}
                        onDelete={() => onDeleteField(field.id)}
                        onDuplicate={() => onDuplicateField(field.id)}
                        onDragStart={handleDragStart(index)}
                        onDragOver={handleDragOver(index)}
                        onDrop={handleDrop(index)}
                        accentColor={accentColor}
                    />
                ))}
            </div>

            {/* Add Question Button */}
            <div className="relative flex justify-center mt-4" ref={addMenuRef}>
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

export default FormEditor;
