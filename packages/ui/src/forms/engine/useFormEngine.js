import { useState, useMemo } from 'react';

/**
 * useFormEngine - A custom hook that encapsulates all state, validation, 
 * and logic for executing a form survey.
 */
export const useFormEngine = (form, onSubmitCallback, toast) => {
    const [values, setValues] = useState({});
    const [submitted, setSubmitted] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errors, setErrors] = useState({});
    const [currentPage, setCurrentPage] = useState(0);

    // Calculate pages based on 'heading' fields
    const pages = useMemo(() => {
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
            const val = values[field.id];
            let isEmpty = val === undefined || val === null || val === '' || (Array.isArray(val) && val.length === 0);

            // Rating specific empty check (0 means unselected)
            if (field.type === 'rating' && val === 0) {
                isEmpty = true;
            }

            if (field.required && field.type !== 'heading' && field.type !== 'hidden') {
                if (isEmpty) {
                    newErrors[field.id] = 'This field is required';
                }
            }

            // Only perform format validation if the field is not empty
            if (!isEmpty) {
                if (field.type === 'number') {
                    const numVal = Number(val);
                    if (field.min !== undefined && field.min !== '' && numVal < Number(field.min)) {
                        newErrors[field.id] = `Must be at least ${field.min}`;
                    }
                    if (field.max !== undefined && field.max !== '' && numVal > Number(field.max)) {
                        newErrors[field.id] = `Must be no more than ${field.max}`;
                    }
                }
                if (field.type === 'email') {
                    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                    if (!emailRegex.test(val)) {
                        newErrors[field.id] = 'Please enter a valid email address';
                    }
                }
                if (field.type === 'phone') {
                    const phoneRegex = /^[\d\s+\-()]{7,20}$/;
                    if (!phoneRegex.test(val)) {
                        newErrors[field.id] = 'Please enter a valid phone number';
                    }
                }
                if (field.type === 'url') {
                    try {
                        new URL(val);
                    } catch (e) {
                        newErrors[field.id] = 'Please enter a valid URL (e.g., https://example.com)';
                    }
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
                toast?.error('An error occurred submitting your response. Please try again.');
            } finally {
                setIsSubmitting(false);
            }
        } else {
            setSubmitted(true);
            setTimeout(() => setSubmitted(false), 4000);
        }
    };

    const handleReset = () => {
        setValues({});
        setCurrentPage(0);
        setErrors({});
        setSubmitted(false);
    };

    // Calculate progress
    const requiredFields = (form?.fields || []).filter(f => !f.deleted && f.required && f.type !== 'heading' && f.type !== 'hidden');
    const filledRequiredFields = requiredFields.filter(f => {
        const val = values[f.id];
        return val !== undefined && val !== null && val !== '' && (!Array.isArray(val) || val.length > 0);
    });
    const progress = requiredFields.length === 0 ? 100 : Math.round((filledRequiredFields.length / requiredFields.length) * 100);

    return {
        values,
        errors,
        currentPage,
        pages,
        progress,
        isSubmitting,
        submitted,
        handleChange,
        handleNextPage,
        handleBackPage,
        handleFinalSubmit,
        handleReset
    };
};
