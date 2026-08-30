import { useQuery } from '@tanstack/react-query';
import { getExecutionLog, getExecutionLogs } from '../backend.js';
import { useWorkspaceScope } from '../../context/WorkspaceScopeContext.jsx';

export function useExecutionLogs({ search = '', status = 'All', workflowId = '', cursor = null, pageSize = 10 } = {}) {
    const { scope } = useWorkspaceScope();
    return useQuery({
        queryKey: ['executionLogs', { search, status, workflowId, cursor, pageSize, scope }],
        queryFn: () => getExecutionLogs({ search, status, workflowId, cursor, pageSize, scope }),
        staleTime: 5 * 1000
    });
}

export function useExecutionLog(id) {
    const { scope } = useWorkspaceScope();
    return useQuery({
        queryKey: ['executionLog', id, { scope }],
        queryFn: () => getExecutionLog(id, scope),
        enabled: Boolean(id),
        staleTime: 30 * 1000
    });
}
