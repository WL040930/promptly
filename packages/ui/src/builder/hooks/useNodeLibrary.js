import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../../api/client.js';

/**
 * Fetches the node library from the backend.
 * Returns { data: nodeLibrary, isLoading }
 */
export function useNodeLibrary() {
    return useQuery({
        queryKey: ['nodeLibrary'],
        staleTime: 0,
        refetchOnWindowFocus: true,
        queryFn: () => apiRequest('/api/nodes/library')
    });
}
