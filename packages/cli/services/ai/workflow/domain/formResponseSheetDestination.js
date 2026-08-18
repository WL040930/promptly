const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

const existingDestinationModes = new Set(['existing_named', 'existing_selected', 'requires_existing']);

export const FORM_RESPONSE_SHEET_DESTINATIONS = Object.freeze({
    none: 'none',
    existing: 'existing',
    provisionOnce: 'provision_once',
    perSubmission: 'per_submission'
});

const nodeKeyFor = node => node?.nodeKey || (node?.type && node?.subType ? `${node.type}:${node.subType}` : null);
const isFormTrigger = node => nodeKeyFor(node) === 'trigger:form-submission' || node?.subType === 'form-submission';
const isRuntimeSheetCreator = node => nodeKeyFor(node) === 'action:googleSheetsCreate' || node?.subType === 'googleSheetsCreate';

/**
 * The worker's generic graph operations are the only operations that can add
 * a Create Google Sheet node. Keep the extraction here so generation and
 * proposal application share the same understanding of what the graph does.
 */
export const nodeDefinitionsForOperations = (operations = []) => (operations || []).flatMap(operation => {
    if (!isObject(operation)) return [];
    if (['create_node', 'insert_between', 'insert_after_route'].includes(operation.op)) return [operation.node];
    if (operation.op === 'add_condition_branch') return [operation.whenTrue, operation.whenFalse];
    if (operation.op === 'add_switch_routes') return [
        ...(operation.cases || []).map(routeCase => routeCase?.action),
        operation.otherwise
    ];
    if (operation.op === 'add_error_handler') return [operation.whenError];
    if (operation.op === 'add_approval_gate') return [operation.whenApproved, operation.whenRejected];
    if (operation.op === 'join_branches') return [operation.continueWith];
    return [];
}).filter(Boolean);

const candidateNodes = ({ nodes = [], operations = [] } = {}) => [
    ...(nodes || []),
    ...nodeDefinitionsForOperations(operations)
];

export const isFormResponseSheetWorkflow = ({ nodes = [], operations = [], formSchema = null } = {}) => Boolean(formSchema)
    || candidateNodes({ nodes, operations }).some(isFormTrigger);

const hasProvisionedSheet = resourceChanges => (resourceChanges || []).some(change => change?.type === 'create_google_spreadsheet');
const hasPerSubmissionCapability = capabilities => (capabilities || []).includes('per_submission_spreadsheet');

/**
 * Resolve the one allowed destination strategy for a form-response workflow.
 * `perSubmissionRequested: false` is intentional: generation receives the
 * user-derived decision and must not let a model-created capability override
 * it. Application omits that flag so persisted per-submission proposals still
 * retain their declared strategy.
 */
export const resolveFormResponseSheetDestination = ({
    nodes = [],
    operations = [],
    resourceChanges = [],
    spreadsheetIntent = null,
    capabilities = [],
    perSubmissionRequested = undefined,
    formSchema = null
} = {}) => {
    if (!isFormResponseSheetWorkflow({ nodes, operations, formSchema })) return FORM_RESPONSE_SHEET_DESTINATIONS.none;
    const intentMode = spreadsheetIntent?.mode;
    if (existingDestinationModes.has(intentMode)) return FORM_RESPONSE_SHEET_DESTINATIONS.existing;
    if (perSubmissionRequested === true || (perSubmissionRequested !== false && hasPerSubmissionCapability(capabilities))) {
        return FORM_RESPONSE_SHEET_DESTINATIONS.perSubmission;
    }
    if (intentMode === 'create' || hasProvisionedSheet(resourceChanges)) return FORM_RESPONSE_SHEET_DESTINATIONS.provisionOnce;
    return FORM_RESPONSE_SHEET_DESTINATIONS.none;
};

/**
 * Return structured issues rather than mutating a graph. A bad proposal is
 * repaired by the worker or rejected at Apply; silently deleting a node could
 * hide a materially different workflow from the reviewer.
 */
export const validateFormResponseSheetDestination = input => {
    const {
        nodes = [],
        operations = [],
        resourceChanges = []
    } = input || {};
    if (!isFormResponseSheetWorkflow(input)) return [];

    const strategy = resolveFormResponseSheetDestination(input);
    const hasRuntimeCreator = candidateNodes({ nodes, operations }).some(isRuntimeSheetCreator);
    const hasProvisioning = hasProvisionedSheet(resourceChanges);
    const issues = [];

    if (hasRuntimeCreator && strategy !== FORM_RESPONSE_SHEET_DESTINATIONS.perSubmission) {
        issues.push({
            code: 'WORKFLOW_FORM_RESPONSE_RUNTIME_SHEET_CREATOR_FORBIDDEN',
            path: 'nodes',
            strategy,
            message: strategy === FORM_RESPONSE_SHEET_DESTINATIONS.existing
                ? 'An existing Google Sheet is selected, so do not add a runtime Create Google Sheet step.'
                : strategy === FORM_RESPONSE_SHEET_DESTINATIONS.provisionOnce
                    ? 'This proposal creates one response Sheet when you apply it, so do not add a runtime Create Google Sheet step that would run for every submission.'
                    : 'Create Google Sheet is only allowed when the user explicitly requests a separate Sheet for every form submission.'
        });
    }

    if (hasProvisioning && strategy === FORM_RESPONSE_SHEET_DESTINATIONS.perSubmission) {
        issues.push({
            code: 'WORKFLOW_FORM_RESPONSE_PROVISIONING_FORBIDDEN',
            path: 'resourceChanges',
            strategy,
            message: 'This workflow creates a separate Google Sheet for every form submission, so it cannot also create one Sheet when the proposal is applied.'
        });
    }

    if (hasProvisioning && strategy === FORM_RESPONSE_SHEET_DESTINATIONS.existing) {
        issues.push({
            code: 'WORKFLOW_FORM_RESPONSE_PROVISIONING_FORBIDDEN',
            path: 'resourceChanges',
            strategy,
            message: 'An existing Google Sheet is selected, so this proposal must not create another Sheet when applied.'
        });
    }

    return issues;
};

export const formResponseSheetDestinationInternals = Object.freeze({
    existingDestinationModes,
    hasProvisionedSheet,
    hasPerSubmissionCapability,
    isFormTrigger,
    isRuntimeSheetCreator
});
