import React, { useEffect, useState } from 'react';
import FormPreview from './FormPreview';
import PublicFormStatus from './components/PublicFormStatus';
import { getPublicForm, submitFormResponse } from '../api/backend';

const FORM_SUBMISSION_STORAGE_PREFIX = 'promptly_form_submitted_';

function getPublicFormId(pathname = window.location.pathname) {
    const pathParts = pathname.split('/').filter(Boolean);
    return pathParts[pathParts.length - 1];
}

function getSubmissionStorageKey(formId) {
    return `${FORM_SUBMISSION_STORAGE_PREFIX}${formId}`;
}

const PublicFormView = () => {
    const [form, setForm] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [hasSubmitted, setHasSubmitted] = useState(false);

    useEffect(() => {
        const fetchForm = async () => {
            try {
                const id = getPublicFormId();

                if (!id) {
                    throw new Error('No form ID provided');
                }

                const data = await getPublicForm(id);
                setForm(data);

                if (data.settings?.limitOnePerBrowser && localStorage.getItem(getSubmissionStorageKey(id))) {
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
            localStorage.setItem(getSubmissionStorageKey(form.id), 'true');
        }
    };

    if (loading) {
        return (
            <div className="app-center-page">
                <div className="app-loading-spinner-lg"></div>
            </div>
        );
    }

    if (error || !form) {
        return <PublicFormStatus status="notFound" message={error} />;
    }

    if (form.settings?.acceptingResponses === false) {
        return <PublicFormStatus status="closed" />;
    }

    if (hasSubmitted) {
        return <PublicFormStatus status="submitted" />;
    }

    return (
        <div className="app-page">
            <FormPreview
                form={form}
                accentColor={form.settings?.accentColor || '#4f46e5'}
                onSubmitCallback={handleSubmit}
            />
        </div>
    );
};

export default PublicFormView;
