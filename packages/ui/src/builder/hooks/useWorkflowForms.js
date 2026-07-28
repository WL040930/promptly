import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { getForm } from '../../api/backend.js';

/** Fetches only the form schemas referenced by workflow form-submission steps. */
export function useWorkflowForms(nodes = []) {
    const formIds = useMemo(() => [...new Set((nodes || [])
        .filter(node => node?.subType === 'form-submission' && node?.config?.formId)
        .map(node => node.config.formId))], [nodes]);

    const queries = useQueries({
        queries: formIds.map(formId => ({
            queryKey: ['forms', formId],
            queryFn: () => getForm(formId),
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
