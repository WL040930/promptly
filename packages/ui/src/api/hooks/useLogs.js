import { useQuery } from '@tanstack/react-query';
import { getExecutionLogs } from '../backend.js';

export function useExecutionLogs({ search = '', status = 'All' } = {}) {
    return useQuery({
        queryKey: ['executionLogs', { search, status }],
        queryFn: () => getExecutionLogs(search, status),
        placeholderData: (previousData) => previousData,
        staleTime: 5 * 1000
    });
}
