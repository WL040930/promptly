import React from 'react';

const SIZES = {
    sm: {
        container: 'w-7 h-4',
        thumb: 'w-2.5 h-2.5',
        translateActive: 'translate-x-3.5',
        border: 'border',
        padding: 'px-[1px]'
    },
    md: {
        container: 'w-9 h-5',
        thumb: 'w-3 h-3',
        translateActive: 'translate-x-5',
        border: 'border',
        padding: 'px-[2px]'
    },
    lg: {
        container: 'w-14 h-8',
        thumb: 'w-6 h-6',
        translateActive: 'translate-x-6',
        border: 'border-2',
        padding: 'px-[2px]'
    }
};

/**
 * A shared Switch (toggle) component.
 */
export default function Switch({
    checked,
    onChange,
    size = 'md',
    activeColor = '#10b981', // Default emerald-500
    inactiveColor = '#f3f4f6', // Default gray-100
    inactiveBorderColor = '#e5e7eb', // Default gray-200
    className = '',
    title = ''
}) {
    const s = SIZES[size] || SIZES.md;
    
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            onClick={(e) => {
                e.stopPropagation();
                onChange(!checked);
            }}
            title={title}
            className={`relative inline-flex items-center shrink-0 rounded-full transition-colors duration-300 ${s.container} ${s.border} ${s.padding} ${className}`}
            style={{
                backgroundColor: checked ? activeColor : inactiveColor,
                borderColor: checked ? 'transparent' : inactiveBorderColor
            }}
        >
            <span
                className={`bg-white rounded-full shadow-sm transition-transform duration-300 ${s.thumb} ${
                    checked ? s.translateActive : 'translate-x-0'
                }`}
            />
        </button>
    );
}
