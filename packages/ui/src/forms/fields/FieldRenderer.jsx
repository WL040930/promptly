import React, { useState } from 'react';

/**
 * FieldRenderer — renders a single form field in preview/fill mode.
 * Handles all 15 field types with proper HTML inputs and premium styling.
 */
const inputClasses = 'w-full bg-white/90 backdrop-blur-sm border-2 border-gray-200 hover:border-gray-300 rounded-xl px-4 py-3 text-[15px] font-medium text-gray-800 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:bg-white shadow-sm transition-all duration-300';
const focusRing = `focus:border-transparent`;

const FieldRenderer = ({ field, accentColor = '#4f46e5', value, onChange }) => {
    const [rating, setRating] = useState(value || 0);
    const [hoveredStar, setHoveredStar] = useState(0);

    const inputStyle = {
        '--tw-ring-color': accentColor + '40',
        '--tw-ring-offset-width': '2px',
    };

    if (field.type === 'heading') {
        return (
            <div className="py-4 border-b-2 border-gray-200 mb-2">
                <h3 className="text-2xl font-bold text-gray-900 tracking-tight">{field.label || 'Section Title'}</h3>
                {field.subtext && (
                    <p className="text-base text-gray-600 mt-2 leading-relaxed">{field.subtext}</p>
                )}
            </div>
        );
    }

    if (field.type === 'hidden') return null;

    const labelEl = (
        <label className="block text-[15px] font-semibold text-gray-800 mb-2.5 tracking-tight">
            {field.label}
            {field.required && <span className="ml-1 font-bold" style={{ color: accentColor }}>*</span>}
        </label>
    );

    switch (field.type) {
        case 'textarea':
            return (
                <div className="animate-slide-up-fade">
                    {labelEl}
                    <textarea
                        rows={field.rows || 4}
                        className={`${inputClasses} ${focusRing} resize-none`}
                        placeholder={field.placeholder || 'Type your answer here...'}
                        style={inputStyle}
                        value={value || ''}
                        onChange={e => onChange?.(e.target.value)}
                    />
                </div>
            );

        case 'select':
            return (
                <div className="animate-slide-up-fade">
                    {labelEl}
                    <div className="relative">
                        <select
                            className={`${inputClasses} ${focusRing} appearance-none cursor-pointer pr-10`}
                            style={inputStyle}
                            value={value || ''}
                            onChange={e => onChange?.(e.target.value)}
                        >
                            <option value="" disabled>Select an option</option>
                            {(field.choices || []).map((choice, idx) => (
                                <option key={idx} value={choice}>{choice}</option>
                            ))}
                        </select>
                        <svg className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M6 9l6 6 6-6" />
                        </svg>
                    </div>
                </div>
            );

        case 'radio':
            return (
                <div className="animate-slide-up-fade">
                    {labelEl}
                    <div className="flex flex-col gap-2.5 mt-2">
                        {(field.choices || []).map((choice, idx) => {
                            const isChecked = value === choice;
                            return (
                                <label key={idx} className={`flex items-center gap-3.5 px-4 py-3 rounded-xl border-2 cursor-pointer transition-all duration-300 group ${isChecked ? 'bg-white shadow-md' : 'bg-white border-gray-200 hover:border-gray-300 hover:bg-gray-50 shadow-sm'}`} style={isChecked ? { borderColor: accentColor } : {}}>
                                    <div className="relative flex items-center justify-center shrink-0">
                                        <input
                                            type="radio"
                                            name={`radio-${field.id}`}
                                            value={choice}
                                            checked={isChecked}
                                            onChange={() => onChange?.(choice)}
                                            className="sr-only peer"
                                        />
                                        <div className="w-5 h-5 rounded-full border-2 border-gray-400 peer-checked:border-transparent transition-all duration-300 shadow-inner bg-white" 
                                             style={isChecked ? { borderColor: accentColor } : {}} />
                                        {isChecked && (
                                            <div className="absolute w-2.5 h-2.5 rounded-full scale-in-center animate-bounce-in" style={{ backgroundColor: accentColor }} />
                                        )}
                                    </div>
                                    <span className={`text-[15px] font-medium transition-colors ${isChecked ? 'text-gray-900' : 'text-gray-700'}`}>{choice}</span>
                                </label>
                            );
                        })}
                    </div>
                </div>
            );

        case 'checkbox':
            return (
                <div className="animate-slide-up-fade">
                    {labelEl}
                    <div className="flex flex-col gap-2.5 mt-2">
                        {(field.choices || []).map((choice, idx) => {
                            const isChecked = Array.isArray(value) && value.includes(choice);
                            return (
                                <label key={idx} className={`flex items-center gap-3.5 px-4 py-3 rounded-xl border-2 cursor-pointer transition-all duration-300 group ${isChecked ? 'bg-white shadow-md' : 'bg-white border-gray-200 hover:border-gray-300 hover:bg-gray-50 shadow-sm'}`} style={isChecked ? { borderColor: accentColor } : {}}>
                                    <div className="relative flex items-center justify-center shrink-0">
                                        <input
                                            type="checkbox"
                                            value={choice}
                                            checked={isChecked}
                                            onChange={() => {
                                                const current = Array.isArray(value) ? [...value] : [];
                                                if (isChecked) {
                                                    onChange?.(current.filter(v => v !== choice));
                                                } else {
                                                    onChange?.([...current, choice]);
                                                }
                                            }}
                                            className="sr-only peer"
                                        />
                                        <div
                                            className="w-5 h-5 rounded-md flex items-center justify-center border-2 transition-all duration-300 shadow-inner bg-white"
                                            style={isChecked ? { backgroundColor: accentColor, borderColor: accentColor } : { borderColor: '#9ca3af' }}
                                        >
                                            <svg className={`transition-transform duration-300 ${isChecked ? 'scale-100 opacity-100' : 'scale-50 opacity-0'}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                                                <polyline points="20 6 9 17 4 12" />
                                            </svg>
                                        </div>
                                    </div>
                                    <span className={`text-[15px] font-medium transition-colors ${isChecked ? 'text-gray-900' : 'text-gray-700'}`}>{choice}</span>
                                </label>
                            );
                        })}
                    </div>
                </div>
            );

        case 'file':
            return (
                <div className="animate-slide-up-fade">
                    {labelEl}
                    <div className="border-2 border-dashed border-gray-300 bg-white rounded-2xl p-8 text-center hover:bg-gray-50 hover:border-gray-400 transition-all duration-300 cursor-pointer group">
                        <div className="w-14 h-14 rounded-full bg-white shadow-sm border border-gray-100 flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform duration-300">
                            <svg className="text-gray-400 group-hover:text-gray-600 transition-colors" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
                            </svg>
                        </div>
                        <p className="text-[15px] font-semibold text-gray-700">Click to upload or drag and drop</p>
                        <p className="text-sm font-medium text-gray-400 mt-1">{field.accept ? `Accepted: ${field.accept}` : 'Any file type'}</p>
                    </div>
                </div>
            );

        case 'rating': {
            const max = field.maxRating || 5;
            return (
                <div className="animate-slide-up-fade">
                    {labelEl}
                    <div className="flex gap-1.5 mt-2">
                        {Array.from({ length: max }, (_, i) => i + 1).map(star => {
                            const isFilled = (hoveredStar || rating) >= star;
                            return (
                                <button
                                    key={star}
                                    type="button"
                                    onMouseEnter={() => setHoveredStar(star)}
                                    onMouseLeave={() => setHoveredStar(0)}
                                    onClick={() => {
                                        const newVal = rating === star ? 0 : star;
                                        setRating(newVal);
                                        onChange?.(newVal);
                                    }}
                                    className={`p-1.5 transition-all duration-300 rounded-full ${isFilled ? 'scale-110' : 'hover:scale-110'} ${hoveredStar === star ? 'scale-125' : ''}`}
                                >
                                    <svg
                                        width="32"
                                        height="32"
                                        viewBox="0 0 24 24"
                                        fill={isFilled ? accentColor : 'none'}
                                        stroke={isFilled ? accentColor : '#d1d5db'}
                                        strokeWidth="1.5"
                                        className="drop-shadow-sm transition-colors duration-300"
                                    >
                                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                                    </svg>
                                </button>
                            );
                        })}
                    </div>
                </div>
            );
        }

        default: {
            const isDateOrTime = field.type === 'date' || field.type === 'time';
            let inputType = 'text';
            if (['email', 'number', 'url', 'date', 'time'].includes(field.type)) {
                inputType = field.type;
            } else if (field.type === 'phone') {
                inputType = 'tel';
            }

            let placeholder = field.placeholder || 'Type your answer...';
            if (!field.placeholder) {
                if (field.type === 'email') placeholder = 'name@example.com';
                if (field.type === 'phone') placeholder = '+1 (555) 000-0000';
                if (field.type === 'url') placeholder = 'https://example.com';
                if (field.type === 'number') placeholder = 'Enter a number';
            }

            return (
                <div className="animate-slide-up-fade">
                    {labelEl}
                    <input
                        type={inputType}
                        className={`${inputClasses} ${focusRing} ${isDateOrTime ? 'cursor-pointer' : ''}`}
                        placeholder={placeholder}
                        min={field.min || undefined}
                        max={field.max || undefined}
                        style={inputStyle}
                        value={value || ''}
                        onChange={e => onChange?.(e.target.value)}
                    />
                </div>
            );
        }
    }
};

export default FieldRenderer;
