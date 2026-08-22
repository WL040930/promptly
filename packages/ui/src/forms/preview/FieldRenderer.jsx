import React, { useState } from 'react';
import FileUploadField from './FileUploadField';

// ---------------------------------------------------------------------------
// Shared styling constants
// ---------------------------------------------------------------------------

const INPUT_CLASS =
    'w-full bg-white border-2 border-slate-200 hover:border-slate-300 rounded-xl px-4 py-3.5 text-[15px] font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:bg-white focus:border-transparent shadow-sm hover:shadow-md transition-all duration-300 focus:-translate-y-0.5';

const CHOICE_ROW_BASE =
    'flex items-center gap-4 px-5 py-4 rounded-xl border-2 cursor-pointer transition-all duration-300 group';

const CHOICE_ROW_INACTIVE =
    'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50 shadow-sm';

// ---------------------------------------------------------------------------
// Field-type → HTML input type and default placeholder mappings
// ---------------------------------------------------------------------------

const INPUT_TYPE_MAP = {
    email: 'email',
    number: 'number',
    url: 'url',
    date: 'date',
    time: 'time',
    phone: 'tel',
};

const DEFAULT_PLACEHOLDERS = {
    email: 'name@example.com',
    phone: '+1 (555) 000-0000',
    url: 'https://example.com',
    number: 'Enter a number',
};

const getInputType = (fieldType) => INPUT_TYPE_MAP[fieldType] ?? 'text';
const getPlaceholder = (field) => field.placeholder || DEFAULT_PLACEHOLDERS[field.type] || 'Type your answer...';

// ---------------------------------------------------------------------------
// Shared sub-components
// ---------------------------------------------------------------------------

/** Label element shared across all field types */
const getFieldInputId = (field) => `field-${field.id}`;

const FieldLabel = ({ field, accentColor }) => (
    <label htmlFor={getFieldInputId(field)} className="block text-[15px] font-semibold text-gray-800 mb-2.5 tracking-tight">
        {field.label}
        {field.required && <span className="ml-1 font-bold" style={{ color: accentColor }}>*</span>}
    </label>
);

/** Wrapper that adds the slide-up animation and label */
const FieldWrapper = ({ field, accentColor, children }) => (
    <div className="animate-slide-up-fade">
        <FieldLabel field={field} accentColor={accentColor} />
        {children}
    </div>
);

/**
 * A single option row used by both radio and checkbox renderers.
 * `indicator` is the custom radio dot or checkbox box rendered inside the option.
 */
const ChoiceOptionRow = ({ choice, isChecked, accentColor, indicator }) => (
    <label
        className={`${CHOICE_ROW_BASE} ${isChecked ? 'shadow-md' : CHOICE_ROW_INACTIVE}`}
        style={isChecked ? { borderColor: accentColor, backgroundColor: accentColor + '08' } : {}}
    >
        <div className="relative flex items-center justify-center shrink-0">
            {indicator}
        </div>
        <span className={`text-[15px] transition-colors ${isChecked ? 'font-bold text-slate-900' : 'font-medium text-slate-700'}`}>
            {choice}
        </span>
    </label>
);

// ---------------------------------------------------------------------------
// Individual field renderers
// ---------------------------------------------------------------------------

const HeadingField = ({ field, accentColor }) => (
    <div className="pt-2 pb-6 border-b border-slate-100">
        <div className="flex items-center gap-4 mb-3">
            <div className="w-1.5 h-8 rounded-full shrink-0" style={{ backgroundColor: accentColor }} />
            <h3 className="text-3xl font-black text-slate-900 tracking-tight">{field.label || 'Section Title'}</h3>
        </div>
        {field.subtext && (
            <p className="text-[16px] font-medium text-slate-500 leading-relaxed pl-5.5 ml-5">{field.subtext}</p>
        )}
    </div>
);

const TextareaField = ({ field, value, onChange, inputStyle }) => (
    <textarea
        id={getFieldInputId(field)}
        rows={field.rows || 4}
        className={`${INPUT_CLASS} resize-none`}
        placeholder={getPlaceholder(field)}
        style={inputStyle}
        value={value || ''}
        onChange={(e) => onChange?.(e.target.value)}
    />
);

const SelectField = ({ field, value, onChange, inputStyle }) => (
    <div className="relative">
        <select
            id={getFieldInputId(field)}
            className={`${INPUT_CLASS} appearance-none cursor-pointer pr-10`}
            style={inputStyle}
            value={value || ''}
            onChange={(e) => onChange?.(e.target.value)}
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
);

const RadioField = ({ field, value, onChange, accentColor }) => (
    <div className="flex flex-col gap-2.5 mt-2">
        {(field.choices || []).map((choice, idx) => {
            const isChecked = value === choice;
            return (
                <ChoiceOptionRow
                    key={idx}
                    choice={choice}
                    isChecked={isChecked}
                    accentColor={accentColor}
                    indicator={
                        <>
                            <input type="radio" name={`radio-${field.id}`} value={choice} checked={isChecked} onChange={() => onChange?.(choice)} className="sr-only peer" />
                            <div className="w-5 h-5 rounded-full border-2 border-slate-300 transition-all duration-300 shadow-inner bg-white" style={isChecked ? { borderColor: accentColor } : {}} />
                            {isChecked && <div className="absolute w-2.5 h-2.5 rounded-full scale-in-center animate-bounce-in" style={{ backgroundColor: accentColor }} />}
                        </>
                    }
                />
            );
        })}
    </div>
);

const CheckboxField = ({ field, value, onChange, accentColor }) => (
    <div className="flex flex-col gap-2.5 mt-2">
        {(field.choices || []).map((choice, idx) => {
            const isChecked = Array.isArray(value) && value.includes(choice);
            const toggle = () => {
                const current = Array.isArray(value) ? [...value] : [];
                onChange?.(isChecked ? current.filter((v) => v !== choice) : [...current, choice]);
            };
            return (
                <ChoiceOptionRow
                    key={idx}
                    choice={choice}
                    isChecked={isChecked}
                    accentColor={accentColor}
                    indicator={
                        <>
                            <input type="checkbox" value={choice} checked={isChecked} onChange={toggle} className="sr-only peer" />
                            <div
                                className="w-5 h-5 rounded-md flex items-center justify-center border-2 transition-all duration-300 shadow-inner bg-white"
                                style={isChecked ? { backgroundColor: accentColor, borderColor: accentColor } : { borderColor: '#cbd5e1' }}
                            >
                                <svg className={`transition-transform duration-300 ${isChecked ? 'scale-100 opacity-100' : 'scale-50 opacity-0'}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                                    <polyline points="20 6 9 17 4 12" />
                                </svg>
                            </div>
                        </>
                    }
                />
            );
        })}
    </div>
);

const RatingField = ({ field, value, onChange, accentColor }) => {
    const [hoveredStar, setHoveredStar] = useState(0);
    const currentValue = value || 0;
    const max = field.maxRating || 5;

    return (
        <div className="flex gap-1.5 mt-2">
            {Array.from({ length: max }, (_, i) => i + 1).map((star) => {
                const isFilled = (hoveredStar || currentValue) >= star;
                return (
                    <button
                        key={star}
                        type="button"
                        onMouseEnter={() => setHoveredStar(star)}
                        onMouseLeave={() => setHoveredStar(0)}
                        onClick={() => onChange?.(currentValue === star ? 0 : star)}
                        aria-label={`Rate ${star} out of ${max}`}
                        className={`p-1.5 transition-all duration-300 rounded-full ${isFilled ? 'scale-110' : 'hover:scale-110'} ${hoveredStar === star ? 'scale-125' : ''}`}
                    >
                        <svg width="32" height="32" viewBox="0 0 24 24" fill={isFilled ? accentColor : 'none'} stroke={isFilled ? accentColor : '#d1d5db'} strokeWidth="1.5" className="drop-shadow-sm transition-colors duration-300">
                            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                        </svg>
                    </button>
                );
            })}
        </div>
    );
};

const DefaultTextField = ({ field, value, onChange, inputStyle }) => {
    const isDateOrTime = field.type === 'date' || field.type === 'time';
    return (
        <input
            id={getFieldInputId(field)}
            type={getInputType(field.type)}
            className={`${INPUT_CLASS} ${isDateOrTime ? 'cursor-pointer' : ''}`}
            placeholder={getPlaceholder(field)}
            min={field.min || undefined}
            max={field.max || undefined}
            style={inputStyle}
            value={value || ''}
            onChange={(e) => onChange?.(e.target.value)}
        />
    );
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const FieldRenderer = ({ field, formId = null, uploadMode = 'private', accentColor = '#5b4ee8', value, onChange }) => {
    const inputStyle = {
        '--tw-ring-color': accentColor + '40',
        '--tw-ring-offset-width': '2px',
    };

    if (field.type === 'heading') return <HeadingField field={field} accentColor={accentColor} />;
    if (field.type === 'hidden') return null;

    const labelEl = <FieldLabel field={field} accentColor={accentColor} />;

    if (field.type === 'file') {
        return <FileUploadField field={field} formId={formId} uploadMode={uploadMode} value={value} onChange={onChange} labelEl={labelEl} />;
    }

    const sharedProps = { field, value, onChange, accentColor, inputStyle };

    const body = (() => {
        switch (field.type) {
            case 'textarea': return <TextareaField {...sharedProps} />;
            case 'select':   return <SelectField {...sharedProps} />;
            case 'radio':    return <RadioField {...sharedProps} />;
            case 'checkbox': return <CheckboxField {...sharedProps} />;
            case 'rating':   return <RatingField {...sharedProps} />;
            default:         return <DefaultTextField {...sharedProps} />;
        }
    })();

    return (
        <FieldWrapper field={field} accentColor={accentColor}>
            {body}
        </FieldWrapper>
    );
};

export default React.memo(FieldRenderer);
