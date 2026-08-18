import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getForms, getForm, createForm, previewFormChange, updateForm, deleteForm, getFormResponses } from '../backend.js';

export const useFormResponses = (formId, { page = 1, pageSize = 25 } = {}) => {
    return useQuery({
        queryKey: ['formResponses', formId, { page, pageSize }],
        queryFn: () => getFormResponses(formId, { page, pageSize }),
        enabled: !!formId,
        staleTime: 1000 * 30, // 30 seconds
    });
};

export const useForms = () => {
    return useQuery({
        queryKey: ['forms'],
        queryFn: getForms,
    });
};

export const useForm = (formId) => {
    return useQuery({
        queryKey: ['forms', formId],
        queryFn: () => getForm(formId),
        enabled: !!formId,
        retry: false,
    });
};

export const useCreateForm = () => {
    const queryClient = useQueryClient();
    
    return useMutation({
        mutationFn: createForm,
        onSuccess: (newForm) => {
            queryClient.setQueryData(['forms'], old => old ? [...old, newForm] : [newForm]);
            queryClient.invalidateQueries({ queryKey: ['forms'] });
        },
    });
};

export const useUpdateForm = () => {
    const queryClient = useQueryClient();
    
    return useMutation({
        mutationFn: ({ id, data }) => updateForm(id, data),
        onMutate: async ({ id, data }) => {
            await queryClient.cancelQueries({ queryKey: ['forms'] });
            const previousForms = queryClient.getQueryData(['forms']);
            if (previousForms) {
                queryClient.setQueryData(['forms'], old => old.map(f => f.id === id ? { ...f, ...data } : f));
            }
            return { previousForms };
        },
        onSuccess: form => {
            if (!form?.id) return;
            queryClient.setQueryData(['forms'], old => old
                ? old.map(item => item.id === form.id ? form : item)
                : old);
            queryClient.setQueryData(['forms', form.id], form);
            if (Array.isArray(form.workflowChanges) && form.workflowChanges.length > 0) {
                queryClient.invalidateQueries({ queryKey: ['workflows'] });
            }
        },
        onError: (err, variables, context) => {
            if (context?.previousForms) {
                queryClient.setQueryData(['forms'], context.previousForms);
            }
        },
        // The mutation response is authoritative. Avoid immediately
        // refetching the forms list after each debounced autosave.
    });
};

export const usePreviewFormChange = () => useMutation({
    mutationFn: ({ id, data }) => previewFormChange(id, data)
});

export const useDeleteForm = () => {
    const queryClient = useQueryClient();
    
    return useMutation({
        mutationFn: deleteForm,
        onMutate: async (id) => {
            await queryClient.cancelQueries({ queryKey: ['forms'] });
            const previousForms = queryClient.getQueryData(['forms']);
            if (previousForms) {
                queryClient.setQueryData(['forms'], old => old.filter(f => f.id !== id));
            }
            return { previousForms };
        },
        onError: (err, variables, context) => {
            if (context?.previousForms) {
                queryClient.setQueryData(['forms'], context.previousForms);
            }
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ['forms'] });
        },
    });
};
