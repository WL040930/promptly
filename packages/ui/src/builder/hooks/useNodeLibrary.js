import { useQuery } from '@tanstack/react-query';

/**
 * Fetches the node library from the backend.
 * Returns { data: nodeLibrary, isLoading }
 */
export function useNodeLibrary() {
    return useQuery({
        queryKey: ['nodeLibrary'],
        staleTime: 0,
        refetchOnWindowFocus: true,
        queryFn: async () => {
            const response = await fetch('/api/nodes/library');
            if (!response.ok) throw new Error('Failed to load node library');
            return response.json();
        }
    });
}
