import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getWorkflows, createWorkflow, updateWorkflow, deleteWorkflow } from '../backend.js';

export const useWorkflows = () => {
    return useQuery({
        queryKey: ['workflows'],
        queryFn: getWorkflows,
    });
};

export const useCreateWorkflow = () => {
    const queryClient = useQueryClient();
    
    return useMutation({
        mutationFn: createWorkflow,
        onSuccess: (newWorkflow) => {
            queryClient.setQueryData(['workflows'], old => old ? [...old, newWorkflow] : [newWorkflow]);
            queryClient.invalidateQueries({ queryKey: ['workflows'] });
        },
    });
};

export const useUpdateWorkflow = () => {
    const queryClient = useQueryClient();
    
    return useMutation({
        mutationFn: ({ id, data }) => updateWorkflow(id, data),
        onMutate: async ({ id, data }) => {
            await queryClient.cancelQueries({ queryKey: ['workflows'] });
            const previousWorkflows = queryClient.getQueryData(['workflows']);
            if (previousWorkflows) {
                queryClient.setQueryData(['workflows'], old =>
                    old.map(w => w.id === id ? { ...w, ...data } : w)
                );
            }
            return { previousWorkflows };
        },
        onError: (err, variables, context) => {
            if (context?.previousWorkflows) {
                queryClient.setQueryData(['workflows'], context.previousWorkflows);
            }
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ['workflows'] });
        },
    });
};

export const useDeleteWorkflow = () => {
    const queryClient = useQueryClient();
    
    return useMutation({
        mutationFn: deleteWorkflow,
        onMutate: async (id) => {
            await queryClient.cancelQueries({ queryKey: ['workflows'] });
            const previousWorkflows = queryClient.getQueryData(['workflows']);
            if (previousWorkflows) {
                queryClient.setQueryData(['workflows'], old => old.filter(w => w.id !== id));
            }
            return { previousWorkflows };
        },
        onError: (err, variables, context) => {
            if (context?.previousWorkflows) {
                queryClient.setQueryData(['workflows'], context.previousWorkflows);
            }
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ['workflows'] });
        },
    });
};
