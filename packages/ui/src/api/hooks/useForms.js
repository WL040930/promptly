import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getForms, getForm, createForm, previewFormChange, updateForm, deleteForm, getFormResponses } from '../backend.js';
import { useWorkspaceScope } from '../../context/WorkspaceScopeContext.jsx';

const formsKey = scope => ['forms', { scope }];
const formKey = (formId, scope) => ['forms', formId, { scope }];

export const useFormResponses = (formId, { page = 1, pageSize = 25 } = {}) => {
    const { scope } = useWorkspaceScope();
    return useQuery({
        queryKey: ['formResponses', formId, { page, pageSize, scope }],
        queryFn: () => getFormResponses(formId, { page, pageSize, scope }),
        enabled: !!formId,
        staleTime: 1000 * 30, // 30 seconds
    });
};

export const useForms = () => {
    const { scope } = useWorkspaceScope();
    return useQuery({
        queryKey: formsKey(scope),
        queryFn: () => getForms(scope),
    });
};

export const useForm = (formId) => {
    const { scope } = useWorkspaceScope();
    return useQuery({
        queryKey: formKey(formId, scope),
        queryFn: () => getForm(formId, scope),
        enabled: !!formId,
        retry: false,
    });
};

export const useCreateForm = () => {
    const queryClient = useQueryClient();
    const { scope } = useWorkspaceScope();
    
    return useMutation({
        mutationFn: data => scope === 'demo'
            ? Promise.reject(new Error('The sample workspace is read-only. Exit sample workspace to create a form.'))
            : createForm(data),
        onSuccess: (newForm) => {
            queryClient.setQueryData(formsKey(scope), old => old ? [...old, newForm] : [newForm]);
            queryClient.invalidateQueries({ queryKey: ['forms'] });
        },
    });
};

export const useUpdateForm = () => {
    const queryClient = useQueryClient();
    const { scope } = useWorkspaceScope();
    
    return useMutation({
        mutationFn: ({ id, data }) => scope === 'demo'
            ? Promise.reject(new Error('The sample workspace is read-only. Exit sample workspace to change a form.'))
            : updateForm(id, data),
        onMutate: async ({ id, data }) => {
            await queryClient.cancelQueries({ queryKey: formsKey(scope) });
            const previousForms = queryClient.getQueryData(formsKey(scope));
            if (previousForms) {
                queryClient.setQueryData(formsKey(scope), old => old.map(f => f.id === id ? { ...f, ...data } : f));
            }
            return { previousForms };
        },
        onSuccess: form => {
            if (!form?.id) return;
            queryClient.setQueryData(formsKey(scope), old => old
                ? old.map(item => item.id === form.id ? form : item)
                : old);
            queryClient.setQueryData(formKey(form.id, scope), form);
            if (Array.isArray(form.workflowChanges) && form.workflowChanges.length > 0) {
                queryClient.invalidateQueries({ queryKey: ['workflows'] });
            }
        },
        onError: (err, variables, context) => {
            if (context?.previousForms) {
                queryClient.setQueryData(formsKey(scope), context.previousForms);
            }
        },
        // The mutation response is authoritative. Avoid immediately
        // refetching the forms list after each debounced autosave.
    });
};

export const usePreviewFormChange = () => {
    const { scope } = useWorkspaceScope();
    return useMutation({
        mutationFn: ({ id, data }) => scope === 'demo'
            ? Promise.reject(new Error('The sample workspace is read-only. Exit sample workspace to preview form changes.'))
            : previewFormChange(id, data)
    });
};

export const useDeleteForm = () => {
    const queryClient = useQueryClient();
    const { scope } = useWorkspaceScope();
    
    return useMutation({
        mutationFn: id => scope === 'demo'
            ? Promise.reject(new Error('The sample workspace is read-only. Exit sample workspace to delete a form.'))
            : deleteForm(id),
        onMutate: async (id) => {
            await queryClient.cancelQueries({ queryKey: formsKey(scope) });
            const previousForms = queryClient.getQueryData(formsKey(scope));
            if (previousForms) {
                queryClient.setQueryData(formsKey(scope), old => old.filter(f => f.id !== id));
            }
            return { previousForms };
        },
        onError: (err, variables, context) => {
            if (context?.previousForms) {
                queryClient.setQueryData(formsKey(scope), context.previousForms);
            }
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ['forms'] });
        },
    });
};
