import { normalizeWorkflowReferenceValue } from '../../../../shared/workflowExpressions.js';

const HANDLE_ROOTS = new Set(['triggerData', 'inputData', 'event']);
const PATH_SEGMENT_RE = /^[\w-]+$/;

const issue = (code, path, message, token) => ({ code, path, message, token });

export const descriptorRuntimePath = descriptor => {
    if (!descriptor || typeof descriptor !== 'object') return String(descriptor || '');
    if (descriptor.runtimePath) return descriptor.runtimePath;
    if (descriptor.nodeId && Array.isArray(descriptor.path)) return `${descriptor.nodeId}.${descriptor.path.join('.')}`;
    return '';
};

export const descriptorFromVariable = variable => {
    const runtimePath = descriptorRuntimePath(variable);
    const [nodeId, ...path] = runtimePath.split('.');
    return nodeId && path.length > 0 ? { nodeId, path, runtimePath } : null;
};

const resolveEditorReference = ({ sourcePath, token, availableVars }) => {
    const clean = String(sourcePath || '').trim();
    const [source, ...path] = clean.split('.');
    if (HANDLE_ROOTS.has(source)) return {
        issue: issue('WORKFLOW_REFERENCE_ROOT_HANDLE', 'reference', `'${source}' is a connection handle, not a workflow step. Choose a value from an upstream step.`, token)
    };
    if (!source || path.length === 0 || path.some(part => !PATH_SEGMENT_RE.test(part))) return {
        issue: issue('WORKFLOW_REFERENCE_PATH_INVALID', 'reference', 'Workflow references need a step ID and non-empty field path segments.', token)
    };

    const sourceVars = (availableVars || []).filter(variable => variable?.nodeId === source
        || variable?.nodeTitle === source
        || variable?.path?.startsWith(`${source}.`));
    const sourceIds = [...new Set(sourceVars.map(variable => variable?.nodeId).filter(Boolean))];
    if (sourceIds.length > 1) return {
        issue: issue('WORKFLOW_REFERENCE_SOURCE_AMBIGUOUS', 'reference', `The workflow step '${source}' is ambiguous. Choose the step from the picker.`, token)
    };
    if (sourceIds.length === 0) return {
        issue: issue('WORKFLOW_REFERENCE_SOURCE_UNKNOWN', 'reference', `The workflow step '${source}' is not available upstream.`, token)
    };

    const exact = sourceVars.filter(variable => variable?.runtimePath === clean || variable?.path === clean);
    if (exact.length === 1) {
        const descriptor = descriptorFromVariable(exact[0]);
        if (descriptor) return descriptor;
    }
    if (exact.length > 1) return {
        issue: issue('WORKFLOW_REFERENCE_SOURCE_AMBIGUOUS', 'reference', `The workflow step '${source}' is ambiguous. Choose a value from the picker.`, token)
    };

    const schemaBackedWebhookBody = sourceVars.some(variable => variable?.isSchemaBackedWebhookBody)
        && path[0] === 'body';
    if (schemaBackedWebhookBody) return {
        issue: issue('WORKFLOW_REFERENCE_PATH_INVALID', 'reference', `The webhook body field '${path.slice(1).join('.') || ''}' is not declared by its request body contract.`, token)
    };

    if (path[0] === 'fields') {
        return {
            issue: issue('WORKFLOW_REFERENCE_FIELD_MISSING', 'reference', `The form field '${path[1] || ''}' is not available upstream.`, token)
        };
    }

    const rootPath = `${source}.${path[0]}`;
    const hasKnownRoot = sourceVars.some(variable => variable?.path === rootPath || variable?.runtimePath === `${sourceIds[0]}.${path[0]}`);
    if (!hasKnownRoot) return {
        issue: issue('WORKFLOW_REFERENCE_PATH_INVALID', 'reference', `The workflow step '${source}' does not expose '${path[0]}' as an upstream value.`, token)
    };

    return { nodeId: sourceIds[0], path };
};

export const normalizeEditorWorkflowValue = ({ value, availableVars = [], rejectLegacy = false, path = 'value' } = {}) => normalizeWorkflowReferenceValue({
    value,
    path,
    rejectLegacy,
    resolveReference: ({ sourcePath, token }) => {
        const result = resolveEditorReference({ sourcePath, token, availableVars });
        if (result.issue) return { issue: { ...result.issue, path } };
        return result;
    }
});
