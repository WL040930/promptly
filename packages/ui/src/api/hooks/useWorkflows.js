import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getWorkflows, getWorkflowListPage, getWorkflow, createWorkflow, updateWorkflow, publishWorkflow, pauseWorkflow, deleteWorkflow } from '../backend.js';
import {
    reconcileWorkflowMutationFailure,
    reconcileWorkflowMutationSuccess,
    workflowMutationFields
} from '../../utils/workflowMutationReconciliation.js';
import { useWorkspaceScope } from '../../context/WorkspaceScopeContext.jsx';

const workflowsKey = scope => ['workflows', { scope }];
const workflowKey = (id, scope) => ['workflows', id, { scope }];

export const useWorkflows = () => {
    const { scope } = useWorkspaceScope();
    return useQuery({
        queryKey: workflowsKey(scope),
        queryFn: () => getWorkflows(scope),
    });
};

export const useWorkflowListPage = ({ page = 1, pageSize = 10, search = '', status = 'All', health = 'All' } = {}) => {
    const { scope } = useWorkspaceScope();
    return useQuery({
        queryKey: ['workflowListPage', { page, pageSize, search, status, health, scope }],
        queryFn: () => getWorkflowListPage({ page, pageSize, search, status, health, scope }),
        staleTime: 5 * 1000
    });
};

export const useWorkflow = (id) => {
    const { scope } = useWorkspaceScope();
    return useQuery({
        queryKey: workflowKey(id, scope),
        queryFn: () => getWorkflow(id, scope),
        enabled: !!id,
        retry: false,
    });
};

export const useCreateWorkflow = () => {
    const queryClient = useQueryClient();
    const { scope } = useWorkspaceScope();
    
    return useMutation({
        mutationFn: data => scope === 'demo'
            ? Promise.reject(new Error('The sample workspace is read-only. Exit sample workspace to create an automation.'))
            : createWorkflow(data),
        onSuccess: (newWorkflow) => {
            queryClient.setQueryData(workflowsKey(scope), old => old ? [...old, newWorkflow] : [newWorkflow]);
            queryClient.invalidateQueries({ queryKey: ['workflows'] });
        },
    });
};

export const useUpdateWorkflow = () => {
    const queryClient = useQueryClient();
    const { scope } = useWorkspaceScope();
    
    return useMutation({
        mutationFn: ({ id, data }) => scope === 'demo'
            ? Promise.reject(new Error('The sample workspace is read-only. Exit sample workspace to change an automation.'))
            : updateWorkflow(id, data),
        onMutate: async ({ id, data }) => {
            await queryClient.cancelQueries({ queryKey: workflowsKey(scope) });
            await queryClient.cancelQueries({ queryKey: workflowKey(id, scope) });
            
            const previousWorkflows = queryClient.getQueryData(workflowsKey(scope));
            const previousSingle = queryClient.getQueryData(workflowKey(id, scope));
            const optimisticData = workflowMutationFields(data);
            
            if (previousWorkflows) {
                queryClient.setQueryData(workflowsKey(scope), old =>
                    old.map(w => w.id === id ? { ...w, ...optimisticData } : w)
                );
            }
            if (previousSingle) {
                queryClient.setQueryData(workflowKey(id, scope), old => ({ ...old, ...optimisticData }));
            }
            
            return { previousWorkflows, previousSingle, id };
        },
        onSuccess: (workflow, variables, context) => {
            if (!workflow?.id) return;
            const submitted = context?.optimisticData || workflowMutationFields(variables?.data);
            queryClient.setQueryData(workflowKey(workflow.id, scope), current => reconcileWorkflowMutationSuccess({
                current,
                server: workflow,
                submitted
            }));
            queryClient.setQueryData(workflowsKey(scope), old => old
                ? old.map(item => item.id === workflow.id
                    ? reconcileWorkflowMutationSuccess({ current: item, server: workflow, submitted })
                    : item)
                : old);
        },
        onError: (err, variables, context) => {
            const submitted = context?.optimisticData || workflowMutationFields(variables?.data);
            if (context?.previousWorkflows) {
                queryClient.setQueryData(workflowsKey(scope), current => current?.map(item => {
                    const previous = context.previousWorkflows.find(candidate => candidate.id === item.id);
                    return item.id === context.id
                        ? reconcileWorkflowMutationFailure({ current: item, previous, submitted })
                        : item;
                }) || context.previousWorkflows);
            }
            if (context?.previousSingle && context?.id) {
                queryClient.setQueryData(workflowKey(context.id, scope), current => reconcileWorkflowMutationFailure({
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
    const { scope } = useWorkspaceScope();
    return useMutation({
        mutationFn: value => scope === 'demo'
            ? Promise.reject(new Error('The sample workspace is read-only. Exit sample workspace to change an automation.'))
            : mutationFn(value),
        onSuccess: workflow => {
            queryClient.setQueryData(workflowKey(workflow.id, scope), workflow);
            queryClient.invalidateQueries({ queryKey: ['workflows'] });
        },
    });
};

export const usePublishWorkflow = () => useWorkflowLifecycleMutation(publishWorkflow);
export const usePauseWorkflow = () => useWorkflowLifecycleMutation(pauseWorkflow);

export const useDeleteWorkflow = () => {
    const queryClient = useQueryClient();
    const { scope } = useWorkspaceScope();
    
    return useMutation({
        mutationFn: id => scope === 'demo'
            ? Promise.reject(new Error('The sample workspace is read-only. Exit sample workspace to delete an automation.'))
            : deleteWorkflow(id),
        onMutate: async (id) => {
            await queryClient.cancelQueries({ queryKey: workflowsKey(scope) });
            const previousWorkflows = queryClient.getQueryData(workflowsKey(scope));
            if (previousWorkflows) {
                queryClient.setQueryData(workflowsKey(scope), old => old.filter(w => w.id !== id));
            }
            return { previousWorkflows };
        },
        onError: (err, variables, context) => {
            if (context?.previousWorkflows) {
                queryClient.setQueryData(workflowsKey(scope), context.previousWorkflows);
            }
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ['workflows'] });
            queryClient.invalidateQueries({ queryKey: ['workflowListPage'] });
        },
    });
};

export const useWorkflowVersions = (workflowId, { page = 1, pageSize = 20, source = null } = {}) => {
    const { scope } = useWorkspaceScope();
    return useQuery({
        queryKey: ['workflows', workflowId, 'versions', { page, pageSize, source, scope }],
        queryFn: () => import('../backend.js').then(m => m.getWorkflowVersions(workflowId, { page, pageSize, source, scope })),
        enabled: !!workflowId,
    });
};

export const useWorkflowVersion = (workflowId, versionId) => {
    const { scope } = useWorkspaceScope();
    return useQuery({
        queryKey: ['workflows', workflowId, 'versions', versionId, { scope }],
        queryFn: () => import('../backend.js').then(m => m.getWorkflowVersion(workflowId, versionId, scope)),
        enabled: Boolean(workflowId && versionId),
        staleTime: 30 * 1000
    });
};


export const useRestoreWorkflowVersion = () => {
    const queryClient = useQueryClient();
    const { scope } = useWorkspaceScope();
    
    return useMutation({
        mutationFn: ({ id, versionId }) => scope === 'demo'
            ? Promise.reject(new Error('The sample workspace is read-only. Exit sample workspace to restore a version.'))
            : import('../backend.js').then(m => m.restoreWorkflowVersion(id, versionId)),
        onSuccess: (updatedWorkflow, { id }) => {
            queryClient.setQueryData(workflowsKey(scope), old => 
                old ? old.map(w => w.id === id ? updatedWorkflow : w) : [updatedWorkflow]
            );
            queryClient.invalidateQueries({ queryKey: ['workflows'] });
        },
    });
};
