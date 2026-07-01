import { useState, useRef } from 'react';

export const useFieldDnD = (onReorderFields) => {
    const [draggedIndex, setDraggedIndex] = useState(null);
    const [dragOverIndex, setDragOverIndex] = useState(null);
    const dragIndexRef = useRef(null);

    const handleDragStart = (index) => (e) => {
        dragIndexRef.current = index;
        setDraggedIndex(index);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', index.toString());
    };

    const handleDragOver = (index) => (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (dragOverIndex !== index) {
            setDragOverIndex(index);
        }
    };

    const handleDragLeave = () => {
        setDragOverIndex(null);
    };

    const handleDragEnd = () => {
        setDraggedIndex(null);
        setDragOverIndex(null);
        dragIndexRef.current = null;
    };

    const handleDrop = (targetIndex) => (e) => {
        e.preventDefault();
        const fromIndex = dragIndexRef.current;
        setDraggedIndex(null);
        setDragOverIndex(null);
        if (fromIndex === null || fromIndex === targetIndex) return;
        onReorderFields(fromIndex, targetIndex);
        dragIndexRef.current = null;
    };

    return {
        draggedIndex,
        dragOverIndex,
        handleDragStart,
        handleDragOver,
        handleDragLeave,
        handleDragEnd,
        handleDrop,
    };
};
