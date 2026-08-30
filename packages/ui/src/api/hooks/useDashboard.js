import { useQuery } from '@tanstack/react-query';
import { getDashboardMetrics } from '../backend.js';
import { useWorkspaceScope } from '../../context/WorkspaceScopeContext.jsx';

export const useDashboardMetrics = () => {
    const { scope } = useWorkspaceScope();
    return useQuery({
        queryKey: ['dashboardMetrics', { scope }],
        queryFn: () => getDashboardMetrics(scope),
    });
};
