import { getClarificationModeInstruction, normalizeClarificationMode } from '../../../../../shared/agentContract.js';
import { buildWorkflowEditView } from '../workflowAgentService.js';
import { projectFormResourceContext } from '../../form/context/formResourceContext.js';
import { formFieldBindingsForWorker } from '../domain/formFieldBindings.js';

const MAX_CONTEXT_TEXT = 12000;
const MAX_HISTORY = 10;
const MAX_HISTORY_TEXT = 500;
const MAX_DESCRIPTION_TEXT = 120;
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
        changes: {
            added: (payload.diff?.addedNodes || []).slice(0, 12).map(node => node.title || node.subType),
            updated: (payload.diff?.updatedNodes || []).slice(0, 12).map(node => node.title || node.subType),
            removed: (payload.diff?.removedNodes || []).slice(0, 12).map(node => node.title || node.subType),
            connectionsChanged: (payload.diff?.edges || []).length > 0
        }
    };
};

const compactCatalogue = catalogue => (catalogue || []).map(item => ({
    nodeKey: item.nodeKey,
    type: item.type,
    subType: item.subType,
    title: item.title,
    description: clamp(item.description, MAX_DESCRIPTION_TEXT)
}));

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
    inspectedFormSchema = null,
    formLookupUsed = false,
    forceDecision = false
}) => {
    const sections = [
    ['Resource Identity and Continuity:', JSON.stringify(compactValue(resourceContext || {}))],
    'You are editing this existing workflow. Preserve its purpose, accepted decisions, and graph behavior unless the Current Request explicitly changes them.',
    '',
    'Current Workflow Edit View:',
    JSON.stringify(plannerWorkflowView(workflow)),
    '',
    'Available Node Catalogue:',
    JSON.stringify(compactCatalogue(catalogue)),
    '',
    'Clarification Mode:',
    `${normalizeClarificationMode(clarificationMode)} - ${getClarificationModeInstruction(clarificationMode)}`,
    forceDecision ? 'Choose sensible defaults now. Ask again only when execution or safety is blocked.' : '',
    '',
    'Resolved Turn Context:',
    turnContext ? JSON.stringify(compactValue(turnContext)) : '(none)',
    '',
    'Attached Form Context:',
    formSchema ? JSON.stringify({
        ...projectFormResourceContext(formSchema),
        fieldBindings: formFieldBindingsForWorker({ workflow, formSchema })
    }) : '(none)',
    '',
    'Inspected Form Context:',
    inspectedFormSchema ? JSON.stringify(projectFormResourceContext(inspectedFormSchema)) : '(none)',
    formLookupUsed ? 'A form lookup was already used for this request. Do not request another lookup.' : '',
    '',
    'Available Owned Resources:',
    userContext ? JSON.stringify(compactValue(userContext)) : '(none)',
    '',
    'Recent Conversation:',
    JSON.stringify(history.slice(-MAX_HISTORY).map(compactHistoryMessage)),
    '',
    'Pending Unapplied Proposal:',
    JSON.stringify(compactPending(pendingProposal)),
    '',
    'Current Request:',
    clamp(request)
    ];
    const prompt = sections.map(section => Array.isArray(section) ? section.join('\n') : section).join('\n');
    return {
        prompt,
        metrics: {
            characters: prompt.length,
            catalogueCharacters: JSON.stringify(compactCatalogue(catalogue)).length,
            workflowNodeCount: workflow?.nodes?.length || 0,
            historyMessageCount: Math.min(history.length, MAX_HISTORY),
            pendingProposalIncluded: Boolean(pendingProposal),
            attachedFormFieldCount: formSchema?.fields?.length || 0,
            inspectedFormFieldCount: inspectedFormSchema?.fields?.length || 0,
            formLookupUsed
        }
    };
};

export const buildWorkflowWorkerContext = ({
    workflow,
    specs,
    requirements,
    capabilities,
    resourceContext,
    formSchema = null,
    priorResponse = null,
    repairIssues = []
}) => [
    'Current Workflow Edit View:',
    JSON.stringify(buildWorkflowEditView(workflow)),
    '',
    'Node Specifications:',
    JSON.stringify((specs || []).map(spec => ({
        nodeKey: spec.nodeKey,
        type: spec.type,
        subType: spec.subType,
        title: spec.title,
        description: spec.description,
        schema: spec.schema
    }))),
    '',
    'Planner Requirements:',
    JSON.stringify(requirements || []),
    'Machine Capabilities:',
    JSON.stringify(capabilities || []),
    '',
    'Attached Form Context:',
    formSchema ? JSON.stringify({
        ...projectFormResourceContext(formSchema),
        fieldBindings: formFieldBindingsForWorker({ workflow, formSchema })
    }) : '(none)',
    '',
    'Account Resources:',
    JSON.stringify(compactResources(resourceContext)),
    ...(priorResponse ? [
        '',
        'Previous Invalid Operations:',
        clamp(typeof priorResponse === 'string' ? priorResponse : JSON.stringify(priorResponse)),
        'Repair Issues:',
        clamp(repairIssues.map(item => `${item.code || 'INVALID'}: ${item.message}`).join('\n'), 6000)
    ] : [])
].join('\n');

export const buildWorkflowVerifierContext = ({ requirements, operations, diff, workflow }) => [
    'Planner Requirements:',
    JSON.stringify(requirements || []),
    '',
    'Semantic Operations:',
    JSON.stringify(operations || []),
    '',
    'Compiled Diff:',
    JSON.stringify(diff || {}),
    '',
    'Final Workflow Edit View:',
    JSON.stringify(buildWorkflowEditView(workflow))
].join('\n');

export const buildWorkflowOutputRepairContext = ({ stage, rawText, issues }) => [
    `Repair the ${stage} JSON response. Return a complete corrected response only.`,
    '',
    'Validation Issues:',
    clamp((issues || []).map(item => `${item.code || 'INVALID'} at ${item.path || 'response'}: ${item.message}`).join('\n'), 6000),
    '',
    'Invalid Response:',
    clamp(rawText)
].join('\n');
