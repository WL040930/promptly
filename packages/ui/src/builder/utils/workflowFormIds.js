/** Form schemas needed by the workflow canvas, preview, and live-run modal. */
export const workflowFormIds = (nodes = []) => [...new Set((nodes || [])
    .filter(node => node?.subType === 'form-submission' && node?.config?.formId)
    .map(node => node.config.formId))];
