import { getClarificationModeInstruction, normalizeClarificationMode } from '../../../../../shared/agentContract.js';
import { buildWorkflowEditView } from '../domain/editCompiler/index.js';
import { projectFormResourceContext } from '../../form/context/formResourceContext.js';
import { buildFormBindingCatalogue } from '../../../../../shared/workflowExpressions.js';
import { normalizeWebhookBodySchema, webhookBodyFields } from '../../../../../shared/webhookPayloadContract.js';

const MAX_CONTEXT_TEXT = 12000;
const MAX_HISTORY = 10;
const MAX_HISTORY_TEXT = 500;
const MAX_DESCRIPTION_TEXT = 80;
const MAX_CONFIG_KEYS = 12;
const MAX_CONFIG_ARRAY_ITEMS = 12;
const clamp = (value, max = MAX_CONTEXT_TEXT) => {
    const text = String(value || '');
    return text.length > max ? `${text.slice(0, max)}…` : text;
};

const compactValue = (value, depth = 0) => {
    if (value === null || value === undefined || ['boolean', 'number'].includes(typeof value)) return value;
    if (typeof value === 'string') return clamp(value, 240);
    if (depth >= 3) return '[details omitted]';
    if (Array.isArray(value)) return value.slice(0, MAX_CONFIG_ARRAY_ITEMS).map(item => compactValue(item, depth + 1));
    if (typeof value === 'object') return Object.fromEntries(
        Object.entries(value).slice(0, MAX_CONFIG_KEYS).map(([key, item]) => [key, compactValue(item, depth + 1)])
    );
    return String(value);
};

const plannerWorkflowView = workflow => {
    const editView = buildWorkflowEditView(workflow);
    return {
        revision: editView.revision,
        nodes: editView.nodes.map(node => ({
            ref: node.ref,
            title: node.title,
            type: node.type,
            subType: node.subType,
            nodeKey: node.nodeKey,
            config: compactValue(node.config)
        })),
        connections: editView.connections
    };
};

const webhookContractEntry = ({ nodeRef, title, config = {} }) => {
    const contract = normalizeWebhookBodySchema(config.bodySchema);
    return {
        nodeRef,
        title: title || 'Webhook',
        configured: contract.configured && contract.issues.length === 0,
        ...(contract.issues.length > 0 ? { issues: contract.issues.map(issue => ({ code: issue.code, path: issue.path, message: issue.message })) } : {}),
        fields: contract.configured && contract.issues.length === 0
            ? webhookBodyFields(contract.schema).map(field => ({
                path: field.pathString,
                type: field.schemaType,
                required: field.required,
                ...(field.enum ? { enum: field.enum } : {})
            }))
            : []
    };
};

const webhookContractCatalogue = workflow => {
    const nodes = workflow?.nodes || [];
    const editView = buildWorkflowEditView(workflow);
    return editView.nodes
        .map((node, index) => ({ node, raw: nodes[index] }))
        .filter(({ node }) => node?.subType === 'webhook')
        .map(({ node, raw }) => webhookContractEntry({ nodeRef: node.ref, title: node.title, config: raw?.config }));
};

const plannedWebhookContractCatalogue = linearSteps => (linearSteps || [])
    .filter(step => step?.nodeKey === 'trigger:webhook')
    .map(step => webhookContractEntry({ nodeRef: step.ref, title: step.title, config: step.config }));

const compactHistoryMessage = message => {
    const value = message?.toJSON ? message.toJSON() : message;
    return {
        sender: value?.sender,
        text: clamp(value?.text, MAX_HISTORY_TEXT),
        kind: value?.kind || 'text'
    };
};

const compactPending = pending => {
    if (!pending) return null;
    const payload = pending.payload || pending.proposal || pending;
    return {
        status: pending.proposalStatus || payload.status || 'pending',
        summary: clamp(pending.text || payload.message || payload.summary, 400),
        requirements: (payload.requirements || []).slice(0, 12).map(requirement => ({
            id: requirement.id,
            description: clamp(requirement.description, 300)
        })),
        resourceIntent: compactValue(payload.resourceIntent || null),
        resourceChanges: (payload.resourceChanges || []).slice(0, 4).map(change => ({
            type: change?.type || null,
            title: clamp(change?.title || change?.name || '', 160),
            sheetTitle: clamp(change?.sheetTitle || '', 120)
        })),
        changes: {
            added: (payload.diff?.addedNodes || []).slice(0, 12).map(node => node.title || node.subType),
            updated: (payload.diff?.updatedNodes || []).slice(0, 12).map(node => node.title || node.subType),
            removed: (payload.diff?.removedNodes || []).slice(0, 12).map(node => node.title || node.subType),
            connectionsChanged: (payload.diff?.edges || []).length > 0
        }
    };
};

const compactPlannerInput = input => {
    if (!input?.name || input.isConnection) return null;
    return {
        name: input.name,
        ...(input.schemaKind ? { schemaKind: input.schemaKind } : {}),
        ...(input.required === true ? { required: true } : {}),
        ...(input.defaultValue !== undefined ? { defaultValue: compactValue(input.defaultValue) } : {}),
        ...(input.resource ? { resource: input.resource } : {})
    };
};

const sanitizeWorkerSchema = value => {
    if (Array.isArray(value)) return value.map(item => sanitizeWorkerSchema(item));
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value)
            .filter(([key]) => !['placeholder', 'keyPlaceholder', 'valuePlaceholder'].includes(key))
            .map(([key, item]) => [key, sanitizeWorkerSchema(item)]));
    }
    if (typeof value === 'string') return value.replace(/\{\{[^{}]+\}\}|\$\{[^{}]+\}/g, 'workflow data');
    return value;
};

const sanitizeWorkerWorkflowValue = value => {
    if (typeof value === 'string') return value
        .replace(/\{\{[^{}]+\}\}|\$\{[^{}]+\}/g, '[invalid workflow reference omitted]');
    if (Array.isArray(value)) return value.map(item => sanitizeWorkerWorkflowValue(item));
    if (value && typeof value === 'object') return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, sanitizeWorkerWorkflowValue(item)])
    );
    return value;
};

const sanitizeWorkerWorkflowView = (workflow, specs = []) => {
    const editView = buildWorkflowEditView(workflow);
    const schemas = new Map((specs || []).map(spec => [
        spec?.nodeKey || `${spec?.type || ''}:${spec?.subType || ''}`,
        spec?.schema || {}
    ]));
    return {
        ...editView,
        nodes: editView.nodes.map(node => {
            const schema = schemas.get(node.nodeKey) || {};
            const workflowInputs = new Set((schema.inputs || [])
                .filter(input => input?.valueSyntax === 'workflow-expression')
                .map(input => input.name));
            return {
                ...node,
                config: Object.fromEntries(Object.entries(node.config || {}).map(([name, value]) => [
                    name,
                    workflowInputs.has(name) ? sanitizeWorkerWorkflowValue(value) : value
                ]))
            };
        })
    };
};

const sanitizeWorkerResponse = value => {
    if (typeof value === 'string') {
        const sanitized = value.replace(/\{\{[^{}]+\}\}|\$\{[^{}]+\}/g, '[invalid workflow reference omitted]');
        return sanitized;
    }
    if (Array.isArray(value)) return value.map(item => sanitizeWorkerResponse(item));
    if (value && typeof value === 'object') return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, sanitizeWorkerResponse(item)])
    );
    return value;
};

// The planner needs the full set of possible node keys, but only the inputs
// that constrain safe routing or resource selection. The worker receives the
// complete authoritative schema after node selection.
const compactCatalogue = catalogue => (catalogue || []).map(item => {
    const inputs = (item.inputs || [])
        .filter(input => input?.required === true || input?.resource || input?.schemaKind === 'webhook-body')
        .slice(0, 12)
        .map(compactPlannerInput)
        .filter(Boolean);
    const outputs = (item.outputs || []).slice(0, 4).map(output => output?.name).filter(Boolean);
    return {
        nodeKey: item.nodeKey,
        title: item.title,
        purpose: clamp(item.description, MAX_DESCRIPTION_TEXT),
        ...(inputs.length ? { inputs } : {}),
        ...(outputs.length ? { outputs } : {})
    };
});

const hasContextContent = value => {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string') return Boolean(value.trim());
    if (Array.isArray(value)) return value.some(hasContextContent);
    if (typeof value === 'object') return Object.values(value).some(hasContextContent);
    return true;
};

const compactResources = resources => Object.fromEntries(Object.entries(resources || {}).map(([key, entry]) => [
    key,
    {
        account: entry?.account || null,
        options: (entry?.options || []).slice(0, 50).map(option => ({
            value: option.value,
            label: option.label,
            description: option.description || null
        })),
        variants: Object.values(entry?.variants || {}).slice(0, 50).map(variant => ({
            params: variant.params || {},
            options: (variant.options || []).slice(0, 50).map(option => ({ value: option.value, label: option.label }))
        })),
        emptyMessage: entry?.emptyMessage || null,
        error: entry?.error || null
    }
]));

export const buildWorkflowPlannerContext = ({
    workflow,
    catalogue,
    history = [],
    pendingProposal = null,
    request,
    clarificationMode,
    turnContext = null,
    userContext = null,
    resourceContext = null,
    formSchema = null,
    formPrerequisites = null,
    inspectedFormSchema = null,
    inspectedRun = null,
    inspectedResource = null,
    spreadsheetIntent = null,
    formLookupUsed = false,
    forceDecision = false
}) => {
    const sections = [];
    const sectionCharacters = {};
    const addSection = (name, value, { required = false } = {}) => {
        if (!required && !hasContextContent(value)) return;
        const text = typeof value === 'string' ? value : JSON.stringify(value);
        const section = `${name}:\n${text}`;
        sections.push(section);
        sectionCharacters[name] = section.length;
    };
    const compactResourceContext = compactValue(resourceContext || {});
    const workflowView = plannerWorkflowView(workflow);
    const plannerCatalogue = compactCatalogue(catalogue);
    const webhookContracts = webhookContractCatalogue(workflow);
    const recentHistory = history.slice(-MAX_HISTORY).map(compactHistoryMessage);
    const pending = compactPending(pendingProposal);

    addSection('Resource Identity and Continuity', compactResourceContext);
    addSection('Workflow Continuity', 'You are editing this existing workflow. Preserve its purpose, accepted decisions, and graph behavior unless the Current Request explicitly changes them.', { required: true });
    addSection('Current Workflow Edit View', workflowView, { required: true });
    addSection('Webhook Payload Contracts', webhookContracts, { required: true });
    addSection('Available Node Catalogue', plannerCatalogue, { required: true });
    addSection('Clarification Mode', `${normalizeClarificationMode(clarificationMode)} - ${getClarificationModeInstruction(clarificationMode)}`, { required: true });
    if (forceDecision) addSection('Decision Resolution', 'Choose sensible defaults now. Ask again only when execution or safety is blocked.', { required: true });
    addSection('Resolved Turn Context', turnContext && compactValue(turnContext));
    addSection('Attached Form Context', formSchema && {
        ...projectFormResourceContext(formSchema),
        fieldBindings: buildFormBindingCatalogue(formSchema).bindings
    });
    addSection('Resolved Form Workflow Contracts', formPrerequisites && compactValue(formPrerequisites));
    addSection('Inspected Form Context', inspectedFormSchema && projectFormResourceContext(inspectedFormSchema));
    if (formLookupUsed) addSection('Form Lookup Status', 'A form lookup was already used for this request. Do not request another lookup.', { required: true });
    addSection('Inspected Run Diagnostic Context', inspectedRun && compactValue(inspectedRun));
    addSection('Inspected Account Resource', inspectedResource && compactValue(inspectedResource));
    addSection('Resolved Spreadsheet Destination', spreadsheetIntent && spreadsheetIntent.mode !== 'none' && compactValue(spreadsheetIntent));
    addSection('Available Owned Resources', userContext && compactValue(userContext));
    addSection('Recent Conversation', recentHistory);
    addSection('Pending Unapplied Proposal', pending);
    addSection('Current Request', clamp(request), { required: true });

    const prompt = sections.join('\n\n');
    const optionalContextCharacters = Object.entries(sectionCharacters)
        .filter(([name]) => !['Workflow Continuity', 'Current Workflow Edit View', 'Available Node Catalogue', 'Clarification Mode', 'Recent Conversation', 'Current Request'].includes(name))
        .reduce((total, [, characters]) => total + characters, 0);
    return {
        prompt,
        metrics: {
            characters: prompt.length,
            sectionCharacters,
            catalogueCharacters: sectionCharacters['Available Node Catalogue'] || 0,
            workflowCharacters: sectionCharacters['Current Workflow Edit View'] || 0,
            historyCharacters: sectionCharacters['Recent Conversation'] || 0,
            optionalContextCharacters,
            workflowNodeCount: workflow?.nodes?.length || 0,
            historyMessageCount: Math.min(history.length, MAX_HISTORY),
            pendingProposalIncluded: Boolean(pendingProposal),
            attachedFormFieldCount: formSchema?.fields?.length || 0,
            inspectedFormFieldCount: inspectedFormSchema?.fields?.length || 0,
            formLookupUsed
        }
    };
};

export const workflowContextInternals = Object.freeze({ compactCatalogue, webhookContractCatalogue });

const describeRepairIssue = item => [
    `${item.code || 'INVALID'} at ${item.path || 'response'}: ${item.message || 'Invalid output.'}`,
    ...(item.value !== undefined ? [`Provided value: ${JSON.stringify(item.value)}`] : []),
    ...(Array.isArray(item.allowed) && item.allowed.length ? [`Allowed values: ${item.allowed.join(', ')}`] : [])
].join(' ');

export const buildWorkflowWorkerContext = ({
    workflow,
    specs,
    requirements,
    capabilities,
    resourceChanges = [],
    sheetDestination = null,
    resourceContext,
    resourceSelections = {},
    formSchema = null,
    formPrerequisites = null,
    linearSteps = [],
    priorResponse = null,
    repairIssues = []
}) => {
    const editView = sanitizeWorkerWorkflowView(workflow, specs);
    const webhookContracts = [
        ...webhookContractCatalogue(workflow),
        ...plannedWebhookContractCatalogue(linearSteps)
    ];
    return [
    'Current Workflow Edit View:',
    JSON.stringify(editView),
    '',
    'Webhook Payload Contracts:',
    JSON.stringify(webhookContracts),
    'For a configured webhook, these are the only declared body paths. Use canonical references with the webhook node ref and a path beginning ["body", ...]. Do not use triggerData.amount or invent undeclared body paths.',
    'If a workflow needs webhook body fields and the contract is not configured, the planner must ask for a JSON example body or field:type list before proposing mappings.',
    '',
    'Valid Existing Node Refs:',
    JSON.stringify(editView.nodes.map(node => node.ref)),
    editView.nodes.length === 0 ? 'This workflow is empty. No existing refs such as n1 or n2 exist; create and connect only the new refs you define in this response.' : '',
    '',
    'Allowed Node Keys:',
    JSON.stringify((specs || []).map(spec => spec.nodeKey)),
    '',
    'Node Specifications:',
    JSON.stringify((specs || []).map(spec => ({
        nodeKey: spec.nodeKey,
        type: spec.type,
        subType: spec.subType,
        title: sanitizeWorkerSchema(spec.title),
        description: sanitizeWorkerSchema(spec.description),
        schema: sanitizeWorkerSchema(spec.schema)
    }))),
    '',
    'Workflow Reference Contract:',
    'Use only structured workflow data values: $binding with a server-issued form binding key, $template for mixed text, or a canonical $expr reference to an upstream node output. Do not write legacy double-brace references or ${...}/steps.* interpolation syntax.',
    'triggerData, inputData, and event are connection handles, not workflow step IDs. Form values must use the attached fieldBindings through $binding or $template; never guess, copy, or remap a handle to a form step.',
    'For an upstream node output, use {"$expr":"reference","v":1,"nodeId":"your_step_ref","path":["outputName"]}; use the node ref from this response, not a database ID. A $template may contain literal strings and canonical references.',
    'Workflow-expression inputs accept $binding, $template, or $expr. Inputs marked node-template must receive plain text. The AI Task prompt may combine literal instructions with an upstream expression or explicit workflow value; an explicit field or upstream reference is authoritative over the connected payload.',
    '',
    'Planner Requirements:',
    JSON.stringify(requirements || []),
    'Linear Blueprint (when supplied, preserve its ordered refs and node keys):',
    JSON.stringify(linearSteps || []),
    'Machine Capabilities:',
    JSON.stringify(capabilities || []),
    '',
    'Form Response Sheet Destination:',
    JSON.stringify(sheetDestination || 'none'),
    '',
    'Resource Changes:',
    JSON.stringify(resourceChanges || []),
    '',
    'Attached Form Context:',
    formSchema ? JSON.stringify({
        ...projectFormResourceContext(formSchema),
        fieldBindings: buildFormBindingCatalogue(formSchema).bindings
    }) : '(none)',
    '',
    'Resolved Form Workflow Contracts:',
    JSON.stringify(formPrerequisites || '(none)'),
    '',
    'Account Resources:',
    JSON.stringify(compactResources(resourceContext)),
    'Resolved Account Selections:',
    JSON.stringify(compactValue(resourceSelections)),
    ...(priorResponse ? [
        '',
        'Previous Invalid Operations:',
        clamp(typeof priorResponse === 'string'
            ? sanitizeWorkerResponse(priorResponse)
            : JSON.stringify(sanitizeWorkerResponse(priorResponse))),
        'Repair Issues:',
        clamp(repairIssues.map(describeRepairIssue).join('\n'), 6000)
    ] : [])
].join('\n');
};

export const buildWorkflowVerifierContext = ({ requirements, operations, diff, workflow, resourceChanges = [], specs = [], formPrerequisites = null }) => [
    'Planner Requirements:',
    JSON.stringify(requirements || []),
    '',
    'Semantic Operations:',
    JSON.stringify(operations || []),
    '',
    'Node Output Contracts:',
    JSON.stringify((specs || []).map(spec => ({
        nodeKey: spec.nodeKey,
        outputs: (spec.schema?.outputs || []).map(output => ({
            name: output.name,
            type: output.type || 'object',
            isConnection: output.isConnection === true,
            ...(output.description ? { description: output.description } : {})
        }))
    }))),
    '',
    'Proposed Resource Changes:',
    JSON.stringify(resourceChanges || []),
    '',
    'Resolved Form Workflow Contracts:',
    JSON.stringify(formPrerequisites || '(none)'),
    '',
    'Webhook Payload Contracts:',
    JSON.stringify(webhookContractCatalogue(workflow)),
    'Verify every webhook body reference uses a declared contract field and canonical path ["body", ...].',
    '',
    'Compiled Diff:',
    JSON.stringify(diff || {}),
    '',
    'Final Workflow Edit View:',
    JSON.stringify(buildWorkflowEditView(workflow))
].join('\n');

export const buildWorkflowOutputRepairContext = ({ stage, prompt = '', rawText, issues }) => [
    `Repair the ${stage} JSON response. Return a complete corrected response only.`,
    '',
    `Original ${stage} context:`,
    clamp(prompt),
    '',
    'Validation Issues:',
    clamp((issues || []).map(describeRepairIssue).join('\n'), 6000),
    '',
    'Invalid Response:',
    clamp(rawText)
].join('\n');
