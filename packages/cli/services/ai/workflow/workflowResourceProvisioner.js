import { validateFormResponseSheetDestination } from './domain/formResponseSheetDestination.js';
import { safeSpreadsheetTitle } from './domain/spreadsheetTitle.js';

const isProvisionReference = value => value !== null && typeof value === 'object' && !Array.isArray(value)
    && typeof value.$provision === 'string' && Object.keys(value).length === 1;

const provisionError = (message, details = {}) => {
    const error = new Error(message);
    error.code = details.code || 'WORKFLOW_PROVISION_REFERENCE_INVALID';
    error.status = 409;
    Object.assign(error, details);
    return error;
};

const resolveReferences = (value, resources) => {
    if (isProvisionReference(value)) {
        const resource = resources.get(value.$provision);
        if (!resource?.id) throw provisionError('A proposed Google Sheet could not be resolved before saving the workflow.', { ref: value.$provision });
        return resource.id;
    }
    if (Array.isArray(value)) return value.map(item => resolveReferences(item, resources));
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveReferences(item, resources)]));
    }
    return value;
};

const resolveSheetConfigs = (nodes, resources) => (nodes || []).map(node => {
    if (node?.subType !== 'googleSheets' || !isProvisionReference(node.config?.spreadsheetId)) return node;
    const ref = node.config.spreadsheetId.$provision;
    const resource = resources.get(ref);
    if (!resource?.id || !resource?.range) {
        throw provisionError('A proposed Google Sheet could not be resolved before saving the workflow.', { ref });
    }
    return {
        ...node,
        config: {
            ...(node.config || {}),
            spreadsheetId: resource.id,
            range: resource.range
        }
    };
});

/**
 * Provisions every declared workflow resource and resolves all `$provision`
 * references. A durable prefix makes retries converge on the same Drive file.
 */
export const provisionWorkflowResources = async ({
    nodes = [],
    changes = [],
    spreadsheetIntent = null,
    capabilities = [],
    userId,
    provisioningKeyPrefix,
    spreadsheetService,
    onFileReady = null
} = {}) => {
    const destinationIssues = validateFormResponseSheetDestination({
        nodes,
        resourceChanges: changes,
        spreadsheetIntent,
        capabilities
    });
    if (destinationIssues.length > 0) {
        throw provisionError(
            'This form response proposal mixes one-time and per-submission Google Sheet creation. Generate a new proposal before applying it.',
            { code: 'WORKFLOW_FORM_RESPONSE_SHEET_DESTINATION_INVALID', issues: destinationIssues }
        );
    }
    const resources = new Map();
    const resolvedChanges = [];

    for (const change of changes || []) {
        if (change?.type !== 'create_google_spreadsheet') {
            resolvedChanges.push(change);
            continue;
        }
        if (!change.ref) throw provisionError('A proposed Google Sheet is missing its provisioning reference.');
        if (resources.has(change.ref)) throw provisionError('A proposed Google Sheet uses a duplicate provisioning reference.', { ref: change.ref });
        const spreadsheetTitle = safeSpreadsheetTitle(change.title);

        let resource = change.status === 'ready' && change.spreadsheetId && change.range
            ? {
                id: change.spreadsheetId,
                range: change.range,
                webViewLink: change.webViewLink || null,
                name: spreadsheetTitle,
                sheetTitle: change.sheetTitle || 'Responses'
            }
            : null;
        if (!resource) {
            if (!spreadsheetService?.createAndInitialize) throw provisionError('Google Sheet provisioning is unavailable.');
            resource = await spreadsheetService.createAndInitialize({
                userId,
                title: spreadsheetTitle,
                sheetTitle: change.sheetTitle || 'Responses',
                headers: change.headers || [],
                folderId: change.folderId || null,
                provisioningKey: `${provisioningKeyPrefix}:${change.ref}`,
                existingSpreadsheetId: change.spreadsheetId || null,
                onFileReady: provisional => onFileReady?.({ change, resource: provisional })
            });
        }
        if (!resource?.id || !resource?.range) throw provisionError('Google did not return a usable spreadsheet resource.', { ref: change.ref });
        resources.set(change.ref, resource);
        resolvedChanges.push({
            ...change,
            title: spreadsheetTitle,
            status: 'ready',
            spreadsheetId: resource.id,
            webViewLink: resource.webViewLink || change.webViewLink || null,
            range: resource.range
        });
    }

    const configuredNodes = resolveSheetConfigs(nodes, resources);
    return {
        nodes: resolveReferences(configuredNodes, resources),
        changes: resolvedChanges,
        resources,
        createdResources: [...resources.values()]
    };
};

export const workflowResourceProvisionerInternals = Object.freeze({
    isProvisionReference,
    resolveReferences,
    resolveSheetConfigs
});
