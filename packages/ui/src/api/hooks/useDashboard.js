import { useQuery } from '@tanstack/react-query';
import { getDashboardMetrics } from '../backend.js';

export const useDashboardMetrics = () => {
    return useQuery({
        queryKey: ['dashboardMetrics'],
        queryFn: getDashboardMetrics,
    });
};
