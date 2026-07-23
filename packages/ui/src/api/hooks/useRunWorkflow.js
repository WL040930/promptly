import { useMutation } from '@tanstack/react-query';
import { triggerProductionWorkflow, triggerWorkflow } from '../backend.js';

/**
 * Triggers a manual workflow run.
 *
 * Usage:
 *   const { mutate, isPending, data, reset } = useRunWorkflow();
 *   mutate({ workflowId, payload: {}, runType: 'test' });
 *   mutate({ workflowId, payload: {}, runType: 'production' });
 *
 * Production runs execute the published revision and may perform real side effects.
 * Test runs execute the current working draft, including unsaved edits.
 * `data` is the AutomationRun returned by the server, which has:
 *   { id, status, durationMs, steps: [{ name, type, status, time, details }] }
 */
export function useRunWorkflow() {
    return useMutation({
        mutationFn: ({ workflowId, payload = {}, revisionId = null, runType = 'test' }) =>
            runType === 'production'
                ? triggerProductionWorkflow(workflowId, payload)
                : triggerWorkflow(workflowId, payload, revisionId),
    });
}
