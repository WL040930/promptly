import React, { useState } from 'react';
import FieldRenderer from './fields/FieldRenderer';
import { useToast } from '../components/ToastContext.jsx';

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
    const [currentPage, setCurrentPage] = useState(0);
    const toast = useToast();

    // Calculate pages based on 'heading' fields
    const pages = React.useMemo(() => {
        const pgs = [];
        let currentPageFields = [];

        (form?.fields || []).filter(f => !f.deleted).forEach(field => {
            if (field.type === 'heading') {
                if (currentPageFields.length > 0) {
                    pgs.push(currentPageFields);
                    currentPageFields = [];
                }
            }
            currentPageFields.push(field);
        });
        if (currentPageFields.length > 0) {
            pgs.push(currentPageFields);
        }
        
        return pgs.length > 0 ? pgs : [[]];
    }, [form?.fields]);

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

    const validateFields = (fieldsToValidate) => {
        const newErrors = {};
        fieldsToValidate.forEach(field => {
            if (field.required && field.type !== 'heading' && field.type !== 'hidden') {
                const val = values[field.id];
                if (val === undefined || val === null || val === '' || (Array.isArray(val) && val.length === 0)) {
                    newErrors[field.id] = 'This field is required';
                }
            }
        });
        return newErrors;
    };

    const handleNextPage = () => {
        const currentFields = pages[currentPage];
        const newErrors = validateFields(currentFields);
        
        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            return;
        }

        setErrors({});
        setCurrentPage(p => p + 1);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleBackPage = () => {
        setErrors({});
        setCurrentPage(p => Math.max(0, p - 1));
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleFinalSubmit = async () => {
        // Validate the current (last) page before submitting
        const currentFields = pages[currentPage];
        const newErrors = validateFields(currentFields);

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
                console.error('Submission error:', err);
                toast.error('An error occurred submitting your response. Please try again.');
            } finally {
                setIsSubmitting(false);
            }
        } else {
            setSubmitted(true);
            setTimeout(() => setSubmitted(false), 4000);
        }
    };

    const confirmationMsg = form.settings?.confirmationMessage || 'Your response has been recorded. Thank you!';

    // Calculate progress
    const requiredFields = form.fields.filter(f => !f.deleted && f.required && f.type !== 'heading' && f.type !== 'hidden');
    const filledRequiredFields = requiredFields.filter(f => {
        const val = values[f.id];
        return val !== undefined && val !== null && val !== '' && (!Array.isArray(val) || val.length > 0);
    });
    const progress = requiredFields.length === 0 ? 100 : Math.round((filledRequiredFields.length / requiredFields.length) * 100);

    return (
        <div
            className={`w-full min-h-screen relative overflow-x-hidden flex flex-col items-center py-12 px-4 sm:px-6 md:py-20 ${submitted ? 'justify-center' : 'justify-start'}`}
            style={{ 
                background: `radial-gradient(circle at top, ${accentColor}15, transparent 50%), radial-gradient(circle at bottom right, ${accentColor}10, transparent 40%)`,
                backgroundColor: '#f8fafc' // slate-50 base
            }}
        >
            {/* Progress Bar (Sticky at top) */}
            <div className="fixed top-0 left-0 w-full h-1.5 bg-gray-200 z-50">
                <div 
                    className="h-full transition-all duration-500 ease-out" 
                    style={{ width: `${progress}%`, backgroundColor: accentColor }}
                />
            </div>

            <div className="w-full max-w-3xl relative z-10 animate-slide-up-fade">
                {submitted ? (
                    // New Success Screen
                    <div className="bg-white rounded-[2rem] p-10 sm:p-16 shadow-2xl text-center border border-gray-100 flex flex-col items-center justify-center min-h-[400px]">
                        <div className="relative">
                            <div className="absolute inset-0 animate-ping rounded-full opacity-20" style={{ backgroundColor: accentColor }} />
                            <div
                                className="w-24 h-24 rounded-full mx-auto mb-8 flex items-center justify-center shadow-lg relative z-10"
                                style={{ backgroundColor: accentColor }}
                            >
                                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="animate-bounce-in">
                                    <polyline points="20 6 9 17 4 12" />
                                </svg>
                            </div>
                        </div>
                        <h3 className="text-3xl font-black text-slate-900 mb-4 tracking-tight">Success!</h3>
                        <p className="text-lg font-medium text-slate-500 leading-relaxed max-w-md mx-auto">{confirmationMsg}</p>
                        
                        <button
                            onClick={() => { setSubmitted(false); setValues({}); setCurrentPage(0); }}
                            className="mt-10 px-8 py-3.5 rounded-2xl text-[15px] font-bold text-white transition-all duration-300 hover:opacity-90 hover:-translate-y-0.5 hover:shadow-lg shadow-md"
                            style={{ backgroundColor: accentColor, boxShadow: `0 8px 20px -4px ${accentColor}60` }}
                        >
                            Submit another response
                        </button>
                    </div>
                ) : (
                    <div className="flex flex-col gap-6">
                        {/* Hero Header Card */}
                        <div 
                            className="rounded-[2rem] p-10 md:p-14 shadow-2xl relative overflow-hidden"
                            style={{ backgroundColor: accentColor }}
                        >
                            {/* Decorative background shapes */}
                            <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
                                <svg className="absolute w-[200%] h-[200%] -top-[50%] -left-[50%]" viewBox="0 0 100 100" preserveAspectRatio="none">
                                    <path d="M0 100 C 20 0 50 0 100 100 Z" fill="white" />
                                </svg>
                            </div>
                            
                            <div className="relative z-10">
                                <h1 className="text-4xl md:text-5xl font-black text-white tracking-tight leading-tight mb-4 drop-shadow-sm">{form.title}</h1>
                                {form.description && (
                                    <p className="text-[17px] md:text-lg font-medium text-white/90 leading-relaxed max-w-2xl">{form.description}</p>
                                )}
                            </div>
                        </div>

                        {/* Main Form Content Card */}
                        <div className="bg-white/95 backdrop-blur-xl rounded-[2rem] shadow-xl border border-gray-100 p-8 sm:p-10 md:p-14">
                            {form.fields.some(f => !f.deleted && f.required && f.type !== 'heading' && f.type !== 'hidden') && (
                                <div className="mb-8 flex items-center justify-end">
                                    <p className="text-[14px] font-bold text-slate-400 bg-slate-50 px-4 py-2 rounded-full border border-slate-100">
                                        <span style={{ color: accentColor }} className="mr-1.5 text-lg leading-none">*</span> Required
                                    </p>
                                </div>
                            )}

                            <div className="flex flex-col gap-10">
                                {pages[currentPage].map((field, idx) => {
                                    const isHeading = field.type === 'heading';
                                    const isLast = idx === pages[currentPage].length - 1;
                                    return (
                                    <div key={field.id} className={`group relative ${isHeading ? 'mb-4' : ''}`}>
                                        {!isHeading && (
                                            <div className="absolute -inset-4 rounded-2xl bg-slate-50/50 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                                        )}
                                        <div className="relative z-10">
                                            <FieldRenderer
                                                field={field}
                                                accentColor={accentColor}
                                                value={values[field.id]}
                                                onChange={(val) => handleChange(field.id, val)}
                                            />
                                            {errors[field.id] && (
                                                <div className="text-[14px] text-rose-500 mt-3 font-bold animate-slide-up-fade flex items-center gap-2 bg-rose-50 px-4 py-2.5 rounded-xl border border-rose-100">
                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="shrink-0">
                                                        <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                                                    </svg>
                                                    {errors[field.id]}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    );
                                })}

                                <div className="pt-8 border-t border-slate-100 mt-6">
                                    <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
                                        <div className="flex items-center gap-4 w-full sm:w-auto">
                                            {currentPage > 0 && (
                                                <button
                                                    type="button"
                                                    onClick={handleBackPage}
                                                    className="w-full sm:w-auto px-6 py-4 rounded-2xl text-[16px] font-bold text-slate-600 bg-slate-100 transition-all duration-300 hover:bg-slate-200"
                                                >
                                                    Back
                                                </button>
                                            )}

                                            {currentPage < pages.length - 1 ? (
                                                <button
                                                    type="button"
                                                    onClick={handleNextPage}
                                                    className="w-full sm:w-auto px-10 py-4 rounded-2xl text-[16px] font-bold text-white transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl"
                                                    style={{ 
                                                        backgroundColor: accentColor,
                                                        boxShadow: `0 10px 25px -5px ${accentColor}60`
                                                    }}
                                                >
                                                    Next
                                                </button>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={handleFinalSubmit}
                                                    disabled={isSubmitting}
                                                    className="w-full sm:w-auto px-10 py-4 rounded-2xl text-[16px] font-bold text-white transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
                                                    style={{ 
                                                        backgroundColor: accentColor,
                                                        boxShadow: `0 10px 25px -5px ${accentColor}60`
                                                    }}
                                                >
                                                    {isSubmitting ? (
                                                        <span className="flex items-center justify-center gap-2">
                                                            <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                                            Submitting...
                                                        </span>
                                                    ) : 'Submit Response'}
                                                </button>
                                            )}
                                        </div>

                                        <button
                                            type="button"
                                            onClick={() => { setValues({}); setCurrentPage(0); }}
                                            className="text-[14px] font-bold text-slate-400 hover:text-slate-600 transition-colors px-6 py-3 hover:bg-slate-50 rounded-xl w-full sm:w-auto"
                                        >
                                            Clear form
                                        </button>
                                    </div>

                                    {form.settings?.limitOnePerBrowser && (
                                        <div className="mt-8 bg-slate-50/80 p-5 rounded-2xl border border-slate-100">
                                            <p className="text-[13px] font-medium text-slate-500 flex items-start gap-3">
                                                <svg className="shrink-0 text-slate-400 mt-0.5" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                                </svg>
                                                <span className="leading-relaxed">
                                                    No sign-in is required to submit this form.<br className="hidden sm:block"/>
                                                    <strong className="text-slate-700">Note: You may only submit this form once per browser.</strong>
                                                </span>
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default FormPreview;
