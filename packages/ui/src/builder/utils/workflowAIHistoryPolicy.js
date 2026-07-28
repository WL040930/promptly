// Workflow AI replies can finish while the AI panel is unmounted after an
// editor switch. Always reconcile the short-lived UI cache with server-owned
// history when the panel returns.
export const workflowAIHistoryQueryPolicy = Object.freeze({
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true
});
