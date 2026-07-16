import { useQuery } from '@tanstack/react-query';
import { getExecutionLog, getExecutionLogs } from '../backend.js';

export function useExecutionLogs({ search = '', status = 'All', workflowId = '', page = 1, pageSize = 10 } = {}) {
    return useQuery({
        queryKey: ['executionLogs', { search, status, workflowId, page, pageSize }],
        queryFn: () => getExecutionLogs({ search, status, workflowId, page, pageSize }),
        staleTime: 5 * 1000
    });
}

export function useExecutionLog(id) {
    return useQuery({
        queryKey: ['executionLog', id],
        queryFn: () => getExecutionLog(id),
        enabled: Boolean(id),
        staleTime: 30 * 1000
    });
}
