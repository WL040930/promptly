import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../client.js';
import { getAuthToken } from '../../utils/storage.js';

export function useMe({ enabled = Boolean(getAuthToken()) } = {}) {
    return useQuery({
        queryKey: ['me'],
        queryFn: async () => {
            const data = await apiRequest('/api/auth/me');
            return data?.user || null;
        },
        enabled,
        retry: false,
        staleTime: 5 * 60 * 1000, // 5 minutes
    });
}
