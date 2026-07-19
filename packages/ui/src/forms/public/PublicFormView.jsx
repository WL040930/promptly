import { useEffect, useState } from 'react';
import FormPreview from '../preview/FormPreview';
import PublicFormStatus from './PublicFormStatus';
import PublicFormLoadingSkeleton from './PublicFormLoadingSkeleton.jsx';
import { usePublicForm, useSubmitFormResponse } from '../../api/hooks/usePublicForms.js';

const FORM_SUBMISSION_STORAGE_PREFIX = 'promptly_form_submitted_';

function getPublicFormId(pathname = window.location.pathname) {
    const pathParts = pathname.split('/').filter(Boolean);
    return pathParts[pathParts.length - 1];
}

function getSubmissionStorageKey(formId) {
    return `${FORM_SUBMISSION_STORAGE_PREFIX}${formId}`;
}

const PublicFormView = () => {
    const [hasSubmitted, setHasSubmitted] = useState(false);
    const formId = getPublicFormId();
    const { data: form, isLoading, isError } = usePublicForm(formId);
    const submitMutation = useSubmitFormResponse();

    useEffect(() => {
        setHasSubmitted(Boolean(
            form?.settings?.limitOnePerBrowser &&
            formId &&
            localStorage.getItem(getSubmissionStorageKey(formId))
        ));
    }, [form, formId]);

    const handleSubmit = async (values) => {
        await submitMutation.mutateAsync({ formId: form.id, responseData: values });
        if (form.settings?.limitOnePerBrowser) {
            localStorage.setItem(getSubmissionStorageKey(form.id), 'true');
        }
    };

    if (isLoading) {
        return <PublicFormLoadingSkeleton />;
    }

    if (isError || !form) {
        return <PublicFormStatus status="notFound" />;
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
