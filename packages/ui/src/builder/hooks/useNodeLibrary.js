import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../../api/client.js';

/**
 * Fetches the node library from the backend.
 * Returns { data: nodeLibrary, isLoading }
 */
export function useNodeLibrary() {
    return useQuery({
        queryKey: ['nodeLibrary'],
        // Node definitions change only when the server is redeployed. Keeping
        // them for the session avoids a needless request every time the
        // workflow editor gains focus.
        staleTime: Infinity,
        refetchOnWindowFocus: false,
        queryFn: () => apiRequest('/api/nodes/library')
    });
}
