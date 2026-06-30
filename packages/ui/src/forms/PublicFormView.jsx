import React, { useEffect, useState } from 'react';
import FormPreview from './FormPreview';
import { getPublicForm, submitFormResponse } from '../api/backend';

const PublicFormView = () => {
    const [form, setForm] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

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
                <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mb-6">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                </div>
                <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight mb-2">Form Not Found</h1>
                <p className="text-gray-500 font-medium text-center">{error}</p>
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
