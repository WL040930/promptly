import React, { useState } from 'react';
import FieldCard from './fields/FieldCard';
import { createField } from './fields/fieldTypes';

import { useFieldDnD } from './hooks/useFieldDnD';
import FormEditorHeader from './components/FormEditorHeader';
import AddFieldPopover from './components/AddFieldPopover';
import { useToast } from '../components/ToastContext.jsx';

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
    const toast = useToast();

    const {
        draggedIndex,
        dragOverIndex,
        handleDragStart,
        handleDragOver,
        handleDragLeave,
        handleDragEnd,
        handleDrop,
    } = useFieldDnD(onReorderFields);

    const handleAddFieldOfType = (type) => {
        const newField = createField(type);
        onAddField(newField);
        setSelectedFieldId(newField.id);
        setShowAddMenu(false);
    };



    return (
        <div className="flex flex-col gap-6 pb-16">
            <FormEditorHeader 
                form={form} 
                onUpdateForm={onUpdateForm} 
                accentColor={accentColor} 
            />

            {/* Field Cards */}
            <div className="flex flex-col gap-4">
                {form.fields.filter(f => !f.deleted).map((field, index) => {
                    const isDragged = draggedIndex === index;
                    const isDragOver = dragOverIndex === index && draggedIndex !== index;
                    
                    return (
                        <div 
                            key={field.id}
                            onDragOver={handleDragOver(index)}
                            onDrop={handleDrop(index)}
                            onDragLeave={handleDragLeave}
                            onDragEnd={handleDragEnd}
                            className={`transition-all duration-300 ease-in-out ${
                                isDragged ? 'opacity-40 scale-95 grayscale' : 'opacity-100'
                            } ${
                                isDragOver ? (draggedIndex < index ? 'pb-24' : 'pt-24') : ''
                            }`}
                        >
                            <FieldCard
                                field={field}
                                isSelected={selectedFieldId === field.id}
                                onSelect={() => setSelectedFieldId(field.id)}
                                onUpdate={(updates) => onUpdateField(field.id, updates)}
                                onDelete={() => onDeleteField(field.id)}
                                onDuplicate={() => onDuplicateField(field.id)}
                                onDragStart={handleDragStart(index)}
                                accentColor={accentColor}
                            />
                        </div>
                    );
                })}
            </div>

            <AddFieldPopover
                showAddMenu={showAddMenu}
                setShowAddMenu={setShowAddMenu}
                handleAddFieldOfType={handleAddFieldOfType}
                accentColor={accentColor}
            />
        </div>
    );
};

export default FormEditor;
