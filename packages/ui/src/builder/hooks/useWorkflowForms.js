import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { getForm } from '../../api/backend.js';
import { workflowFormIds } from '../utils/workflowFormIds.js';
import { useWorkspaceScope } from '../../context/WorkspaceScopeContext.jsx';

/** Fetches only the form schemas referenced by workflow form-submission steps. */
export function useWorkflowForms(nodes = []) {
    const { scope } = useWorkspaceScope();
    const formIds = useMemo(() => workflowFormIds(nodes), [nodes]);

    const queries = useQueries({
        queries: formIds.map(formId => ({
            queryKey: ['forms', formId, { scope }],
            queryFn: () => getForm(formId, scope),
            enabled: Boolean(formId),
            retry: false
        }))
    });

    return useMemo(() => ({
        formsById: Object.fromEntries(queries
            .map(query => query.data)
            .filter(form => form?.id)
            .map(form => [form.id, form])),
        isLoading: queries.some(query => query.isLoading)
    }), [queries]);
}
