import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getWorkflows, getWorkflowListPage, getWorkflow, createWorkflow, updateWorkflow, publishWorkflow, pauseWorkflow, deleteWorkflow } from '../backend.js';
import {
    reconcileWorkflowMutationFailure,
    reconcileWorkflowMutationSuccess,
    workflowMutationFields
} from '../../utils/workflowMutationReconciliation.js';

export const useWorkflows = () => {
    return useQuery({
        queryKey: ['workflows'],
        queryFn: getWorkflows,
    });
};

export const useWorkflowListPage = ({ page = 1, pageSize = 10, search = '', status = 'All', health = 'All' } = {}) => useQuery({
    queryKey: ['workflowListPage', { page, pageSize, search, status, health }],
    queryFn: () => getWorkflowListPage({ page, pageSize, search, status, health }),
    staleTime: 5 * 1000
});

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
            const optimisticData = workflowMutationFields(data);
            
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
        onSuccess: (workflow, variables, context) => {
            if (!workflow?.id) return;
            const submitted = context?.optimisticData || workflowMutationFields(variables?.data);
            queryClient.setQueryData(['workflows', workflow.id], current => reconcileWorkflowMutationSuccess({
                current,
                server: workflow,
                submitted
            }));
            queryClient.setQueryData(['workflows'], old => old
                ? old.map(item => item.id === workflow.id
                    ? reconcileWorkflowMutationSuccess({ current: item, server: workflow, submitted })
                    : item)
                : old);
        },
        onError: (err, variables, context) => {
            const submitted = context?.optimisticData || workflowMutationFields(variables?.data);
            if (context?.previousWorkflows) {
                queryClient.setQueryData(['workflows'], current => current?.map(item => {
                    const previous = context.previousWorkflows.find(candidate => candidate.id === item.id);
                    return item.id === context.id
                        ? reconcileWorkflowMutationFailure({ current: item, previous, submitted })
                        : item;
                }) || context.previousWorkflows);
            }
            if (context?.previousSingle && context?.id) {
                queryClient.setQueryData(['workflows', context.id], current => reconcileWorkflowMutationFailure({
                    current,
                    previous: context.previousSingle,
                    submitted
                }));
            }
        },
        // The update endpoint returns the complete authoritative workflow.
        // Refetching here turned every autosave into an extra read (and, for
        // the list route, an N+1 release-summary query). Cache updates above
        // already keep active views in sync; conflicts/errors roll back.
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
            queryClient.invalidateQueries({ queryKey: ['workflowListPage'] });
        },
    });
};

export const useWorkflowVersions = (workflowId, { page = 1, pageSize = 20, source = null } = {}) => {
    return useQuery({
        queryKey: ['workflows', workflowId, 'versions', { page, pageSize, source }],
        queryFn: () => import('../backend.js').then(m => m.getWorkflowVersions(workflowId, { page, pageSize, source })),
        enabled: !!workflowId,
    });
};

export const useWorkflowVersion = (workflowId, versionId) => useQuery({
    queryKey: ['workflows', workflowId, 'versions', versionId],
    queryFn: () => import('../backend.js').then(m => m.getWorkflowVersion(workflowId, versionId)),
    enabled: Boolean(workflowId && versionId),
    staleTime: 30 * 1000
});


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
