import React, { useState } from 'react';
import FieldRenderer from './fields/FieldRenderer';

/**
 * FormPreview — renders the form as respondents would see it.
 * Overhauled to look like a premium standalone form (Typeform/Google Forms style),
 * with a themed background based on the accent color.
 */
const FormPreview = ({ form, accentColor = '#4f46e5', onSubmitCallback }) => {
    const [values, setValues] = useState({});
    const [submitted, setSubmitted] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errors, setErrors] = useState({});

    const handleChange = (fieldId, value) => {
        setValues(prev => ({ ...prev, [fieldId]: value }));
        if (errors[fieldId]) {
            setErrors(prev => {
                const next = { ...prev };
                delete next[fieldId];
                return next;
            });
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        const newErrors = {};
        form.fields.forEach(field => {
            if (field.required && field.type !== 'heading' && field.type !== 'hidden') {
                const val = values[field.id];
                if (val === undefined || val === null || val === '' || (Array.isArray(val) && val.length === 0)) {
                    newErrors[field.id] = 'This field is required';
                }
            }
        });

        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            return;
        }

        if (onSubmitCallback) {
            setIsSubmitting(true);
            try {
                await onSubmitCallback(values);
                setSubmitted(true);
            } catch (err) {
                console.error(err);
                alert('An error occurred submitting your response. Please try again.');
            } finally {
                setIsSubmitting(false);
            }
        } else {
            setSubmitted(true);
            setTimeout(() => setSubmitted(false), 4000);
        }
    };

    const confirmationMsg = form.settings?.confirmationMessage || 'Your response has been recorded. Thank you!';

    return (
        <div
            className="w-full min-h-full rounded-3xl p-6 md:p-12 transition-colors duration-500 flex flex-col items-center justify-start"
            style={{ backgroundColor: accentColor + '10' }} // very light tint of the accent color
        >
            <div className="w-full max-w-2xl animate-slide-up-fade">
                {submitted ? (
                    <div className="bg-white/90 backdrop-blur-xl border border-white rounded-3xl p-12 shadow-xl text-center">
                        <div
                            className="w-20 h-20 rounded-full mx-auto mb-6 flex items-center justify-center animate-bounce-in shadow-inner"
                            style={{ backgroundColor: accentColor + '15' }}
                        >
                            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke={accentColor} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12" />
                            </svg>
                        </div>
                        <h3 className="text-2xl font-bold text-gray-900 mb-3 tracking-tight">Response submitted</h3>
                        <p className="text-[15px] font-medium text-gray-500 leading-relaxed max-w-md mx-auto">{confirmationMsg}</p>
                        <button
                            onClick={() => { setSubmitted(false); setValues({}); }}
                            className="mt-8 text-[15px] font-bold hover:opacity-80 transition-opacity bg-white px-6 py-3 rounded-full shadow-sm border border-gray-100"
                            style={{ color: accentColor }}
                        >
                            Submit another response
                        </button>
                    </div>
                ) : (
                    <div className="bg-white/95 backdrop-blur-xl border border-white rounded-3xl overflow-hidden shadow-2xl transition-all duration-300">
                        {/* Accent top gradient line */}
                        <div className="h-3 w-full" style={{ background: `linear-gradient(90deg, ${accentColor}, ${accentColor}80)` }} />

                        <div className="p-8 md:p-10">
                            {/* Header */}
                            <div className="mb-8 pb-6 border-b border-gray-100/50">
                                <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">{form.title}</h1>
                                {form.description && (
                                    <p className="text-[15px] font-medium text-gray-500 mt-3 leading-relaxed">{form.description}</p>
                                )}
                                {form.fields.some(f => f.required) && (
                                    <p className="text-[13px] font-bold text-gray-400 mt-4 flex items-center gap-1.5">
                                        <span style={{ color: accentColor }}>*</span> Indicates required field
                                    </p>
                                )}
                            </div>

                            {/* Fields */}
                            <form onSubmit={handleSubmit} className="flex flex-col gap-8">
                                {form.fields.map(field => (
                                    <div key={field.id} className="group">
                                        <FieldRenderer
                                            field={field}
                                            accentColor={accentColor}
                                            value={values[field.id]}
                                            onChange={(val) => handleChange(field.id, val)}
                                        />
                                        {errors[field.id] && (
                                            <p className="text-[13px] text-red-500 mt-2 font-bold animate-slide-up-fade flex items-center gap-1.5">
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                                    <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                                                </svg>
                                                {errors[field.id]}
                                            </p>
                                        )}
                                    </div>
                                ))}

                                <div className="flex items-center justify-between pt-6 border-t border-gray-100/50 mt-4">
                                    <button
                                        type="submit"
                                        disabled={isSubmitting}
                                        className="px-8 py-3.5 rounded-2xl text-[15px] font-bold text-white transition-all duration-300 hover:opacity-90 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                                        style={{ backgroundColor: accentColor }}
                                    >
                                        {isSubmitting ? 'Submitting...' : 'Submit'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setValues({})}
                                        className="text-[13px] font-bold text-gray-400 hover:text-gray-700 transition-colors px-4 py-2 hover:bg-gray-50 rounded-lg"
                                    >
                                        Clear form
                                    </button>
                                </div>
                                {form.settings?.limitOnePerBrowser && (
                                    <div className="mt-2 text-center">
                                        <p className="text-[12px] font-medium text-slate-400">
                                            No sign-in is required to submit this form.<br/>
                                            <span className="text-slate-500 font-semibold">Note: You may only submit this form once per browser.</span>
                                        </p>
                                    </div>
                                )}
                            </form>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default FormPreview;
