import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../client.js';

export function useMe() {
    return useQuery({
        queryKey: ['me'],
        queryFn: async () => {
            const data = await apiRequest('/api/auth/me');
            return data?.user || null;
        },
        staleTime: 5 * 60 * 1000, // 5 minutes
    });
}
