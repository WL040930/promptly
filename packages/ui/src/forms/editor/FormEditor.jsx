import { useState } from 'react';
import FieldCard from './fields/FieldCard';
import { createField } from './fields/fieldTypes';
import { useFieldDnD } from '../hooks/useFieldDnD';
import FormEditorHeader from './FormEditorHeader';
import AddFieldPopover from './AddFieldPopover';

// ---------------------------------------------------------------------------
// DraggableFieldWrapper — drag-and-drop container for a single FieldCard
// ---------------------------------------------------------------------------

const DraggableFieldWrapper = ({
    field,
    index,
    isDragged,
    isDragOver,
    draggedIndex,
    handlers,
    children,
}) => (
    <div
        onDragOver={handlers.handleDragOver(index)}
        onDrop={handlers.handleDrop(index)}
        onDragLeave={handlers.handleDragLeave}
        onDragEnd={handlers.handleDragEnd}
        className={`transition-all duration-300 ease-in-out ${
            isDragged ? 'opacity-40 scale-95 grayscale' : 'opacity-100'
        } ${
            isDragOver ? (draggedIndex < index ? 'pb-24' : 'pt-24') : ''
        }`}
    >
        {children}
    </div>
);

// ---------------------------------------------------------------------------
// FormEditor — the design-mode editor view
// ---------------------------------------------------------------------------

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
    accentColor = '#5b4ee8',
}) => {
    const [selectedFieldId, setSelectedFieldId] = useState(null);
    const [showAddMenu, setShowAddMenu] = useState(false);

    const dnd = useFieldDnD(onReorderFields);

    const handleAddFieldOfType = (type) => {
        const newField = createField(type);
        onAddField(newField);
        setSelectedFieldId(newField.id);
        setShowAddMenu(false);
    };

    const activeFields = form.fields.filter((f) => !f.deleted);

    return (
        <div className="flex flex-col gap-6 pb-16">
            <FormEditorHeader form={form} onUpdateForm={onUpdateForm} accentColor={accentColor} />

            <div className="flex flex-col gap-4">
                {activeFields.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-[#c9c4ff] bg-[#fafaff] px-6 py-10 text-center">
                        <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-[#eeeaff] text-[#5b4ee8]">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M12 5v14M5 12h14" />
                            </svg>
                        </div>
                        <h3 className="font-display text-base font-bold text-[#171827]">Your form is empty</h3>
                        <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">Add a question to give respondents something to answer.</p>
                    </div>
                )}
                {activeFields.map((field, index) => (
                    <DraggableFieldWrapper
                        key={field.id}
                        field={field}
                        index={index}
                        isDragged={dnd.draggedIndex === index}
                        isDragOver={dnd.dragOverIndex === index && dnd.draggedIndex !== index}
                        draggedIndex={dnd.draggedIndex}
                        handlers={dnd}
                    >
                        <FieldCard
                            field={field}
                            isSelected={selectedFieldId === field.id}
                            onSelect={() => setSelectedFieldId(field.id)}
                            onUpdate={(updates) => onUpdateField(field.id, updates)}
                            onDelete={() => onDeleteField(field.id)}
                            onDuplicate={() => onDuplicateField(field.id)}
                            onDragStart={dnd.handleDragStart(index)}
                            accentColor={accentColor}
                        />
                    </DraggableFieldWrapper>
                ))}
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
