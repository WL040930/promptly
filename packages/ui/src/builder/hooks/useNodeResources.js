import { useQuery } from '@tanstack/react-query';
import { getNodeResourceOptions } from '../../api/backend.js';

export function useNodeResources(resource, params = {}, { enabled = true } = {}) {
    return useQuery({
        queryKey: ['nodeResources', resource, params],
        queryFn: () => getNodeResourceOptions(resource, params),
        enabled: Boolean(resource) && enabled,
        staleTime: 30_000,
        retry: false,
        refetchOnWindowFocus: false
    });
}

