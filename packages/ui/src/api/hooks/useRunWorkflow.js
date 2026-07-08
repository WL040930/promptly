import { useMutation } from '@tanstack/react-query';
import { triggerWorkflow } from '../backend.js';

/**
 * Triggers a manual test run for a workflow.
 *
 * Usage:
 *   const { mutate, isPending, data, reset } = useRunWorkflow();
 *   mutate({ workflowId, payload: {} });
 *
 * `data` is the ExecutionLog returned by the server, which has:
 *   { id, status, durationMs, steps: [{ name, type, status, time, details }] }
 */
export function useRunWorkflow() {
    return useMutation({
        mutationFn: ({ workflowId, payload = {} }) =>
            triggerWorkflow(workflowId, payload),
    });
}
