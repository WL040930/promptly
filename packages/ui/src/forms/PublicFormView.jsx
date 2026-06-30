import React, { useEffect, useState } from 'react';
import FormPreview from './FormPreview';
import { getPublicForm, submitFormResponse } from '../api/backend';

const PublicFormView = () => {
    const [form, setForm] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [hasSubmitted, setHasSubmitted] = useState(false);

    useEffect(() => {
        const fetchForm = async () => {
            try {
                // Extract ID from URL path, e.g. /f/form_1234
                const pathParts = window.location.pathname.split('/');
                const id = pathParts[pathParts.length - 1];

                if (!id) {
                    throw new Error('No form ID provided');
                }

                const data = await getPublicForm(id);
                setForm(data);

                // Check localStorage if limitOnePerBrowser is enabled
                if (data.settings?.limitOnePerBrowser && localStorage.getItem(`promptly_form_submitted_${id}`)) {
                    setHasSubmitted(true);
                }
            } catch (err) {
                console.error('Failed to load public form', err);
                setError('This form is no longer available or the link is invalid.');
            } finally {
                setLoading(false);
            }
        };

        fetchForm();
    }, []);

    const handleSubmit = async (values) => {
        await submitFormResponse(form.id, values);
        if (form.settings?.limitOnePerBrowser) {
            localStorage.setItem(`promptly_form_submitted_${form.id}`, 'true');
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-[#f7f9fc] flex items-center justify-center">
                <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    if (error || !form) {
        return (
            <div className="min-h-screen bg-[#f7f9fc] flex flex-col items-center justify-center p-6">
                <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mb-6 shadow-sm border border-red-100">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                </div>
                <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight mb-2">Form Not Found</h1>
                <p className="text-slate-500 font-medium text-center">{error}</p>
            </div>
        );
    }

    if (form.settings?.acceptingResponses === false) {
        return (
            <div className="min-h-screen bg-[#f7f9fc] flex flex-col items-center justify-center p-6">
                <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mb-6 shadow-sm border border-amber-100">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                    </svg>
                </div>
                <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight mb-2">Form Closed</h1>
                <p className="text-slate-500 font-medium text-center max-w-sm">This form is no longer accepting responses.</p>
            </div>
        );
    }

    if (hasSubmitted) {
        return (
            <div className="min-h-screen bg-[#f7f9fc] flex flex-col items-center justify-center p-6">
                <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mb-6 shadow-sm border border-emerald-100">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                </div>
                <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight mb-2">Already Submitted</h1>
                <p className="text-slate-500 font-medium text-center max-w-sm">Thank you! Your response has been recorded. You may only submit this form once per browser.</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#f7f9fc]">
            <FormPreview
                form={form}
                accentColor={form.settings?.accentColor || '#4f46e5'}
                onSubmitCallback={handleSubmit}
            />
        </div>
    );
};

export default PublicFormView;
