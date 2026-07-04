import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getForms, createForm, updateForm, deleteForm, getFormResponses } from '../backend.js';

export const useFormResponses = (formId) => {
    return useQuery({
        queryKey: ['formResponses', formId],
        queryFn: () => getFormResponses(formId),
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
