import { useMutation, useQuery } from '@tanstack/react-query';
import { getPublicForm, submitFormResponse } from '../backend.js';

export function usePublicForm(formId) {
    return useQuery({
        queryKey: ['publicForms', formId],
        queryFn: () => getPublicForm(formId),
        enabled: Boolean(formId),
        retry: false,
        staleTime: 60 * 1000
    });
}

export function useSubmitFormResponse() {
    return useMutation({
        mutationFn: ({ formId, responseData }) => submitFormResponse(formId, responseData)
    });
}
