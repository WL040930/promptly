import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getWorkflows, getWorkflow, createWorkflow, updateWorkflow, publishWorkflow, pauseWorkflow, deleteWorkflow } from '../backend.js';

export const useWorkflows = () => {
    return useQuery({
        queryKey: ['workflows'],
        queryFn: getWorkflows,
    });
};

export const useWorkflow = (id) => {
    return useQuery({
        queryKey: ['workflows', id],
        queryFn: () => getWorkflow(id),
        enabled: !!id,
        retry: false,
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
            await queryClient.cancelQueries({ queryKey: ['workflows', id] });
            
            const previousWorkflows = queryClient.getQueryData(['workflows']);
            const previousSingle = queryClient.getQueryData(['workflows', id]);
            const optimisticData = Object.fromEntries(Object.entries(data || {}).filter(([key]) => key !== 'expectedRevision'));
            
            if (previousWorkflows) {
                queryClient.setQueryData(['workflows'], old =>
                    old.map(w => w.id === id ? { ...w, ...optimisticData } : w)
                );
            }
            if (previousSingle) {
                queryClient.setQueryData(['workflows', id], old => ({ ...old, ...optimisticData }));
            }
            
            return { previousWorkflows, previousSingle, id };
        },
        onSuccess: workflow => {
            if (!workflow?.id) return;
            queryClient.setQueryData(['workflows', workflow.id], workflow);
            queryClient.setQueryData(['workflows'], old => old
                ? old.map(item => item.id === workflow.id ? { ...item, ...workflow } : item)
                : old);
        },
        onError: (err, variables, context) => {
            if (context?.previousWorkflows) {
                queryClient.setQueryData(['workflows'], context.previousWorkflows);
            }
            if (context?.previousSingle && context?.id) {
                queryClient.setQueryData(['workflows', context.id], context.previousSingle);
            }
        },
        onSettled: (data, error, variables) => {
            queryClient.invalidateQueries({ queryKey: ['workflows'] });
            if (variables?.id) {
                queryClient.invalidateQueries({ queryKey: ['workflows', variables.id] });
            }
        },
    });
};

const useWorkflowLifecycleMutation = mutationFn => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn,
        onSuccess: workflow => {
            queryClient.setQueryData(['workflows', workflow.id], workflow);
            queryClient.invalidateQueries({ queryKey: ['workflows'] });
        },
    });
};

export const usePublishWorkflow = () => useWorkflowLifecycleMutation(publishWorkflow);
export const usePauseWorkflow = () => useWorkflowLifecycleMutation(pauseWorkflow);

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

export const useWorkflowVersions = (workflowId) => {
    return useQuery({
        queryKey: ['workflows', workflowId, 'versions'],
        queryFn: () => import('../backend.js').then(m => m.getWorkflowVersions(workflowId)),
        enabled: !!workflowId,
    });
};

export const useSaveWorkflowVersion = () => {
    const queryClient = useQueryClient();
    
    return useMutation({
        mutationFn: (id) => import('../backend.js').then(m => m.saveWorkflowVersion(id)),
        onSuccess: (newVersion, id) => {
            queryClient.invalidateQueries({ queryKey: ['workflows', id, 'versions'] });
            queryClient.invalidateQueries({ queryKey: ['workflows', id] });
            queryClient.invalidateQueries({ queryKey: ['workflows'] });
        },
    });
};

export const useRestoreWorkflowVersion = () => {
    const queryClient = useQueryClient();
    
    return useMutation({
        mutationFn: ({ id, versionId }) => import('../backend.js').then(m => m.restoreWorkflowVersion(id, versionId)),
        onSuccess: (updatedWorkflow, { id }) => {
            queryClient.setQueryData(['workflows'], old => 
                old ? old.map(w => w.id === id ? updatedWorkflow : w) : [updatedWorkflow]
            );
            queryClient.invalidateQueries({ queryKey: ['workflows'] });
        },
    });
};
