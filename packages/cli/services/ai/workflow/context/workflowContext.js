import { getClarificationModeInstruction, normalizeClarificationMode } from '../../../../../shared/agentContract.js';
import { buildWorkflowEditView } from '../workflowAgentService.js';

const MAX_CONTEXT_TEXT = 12000;
const MAX_HISTORY = 24;
const clamp = (value, max = MAX_CONTEXT_TEXT) => {
    const text = String(value || '');
    return text.length > max ? `${text.slice(0, max)}…` : text;
};

const compactHistoryMessage = message => {
    const value = message?.toJSON ? message.toJSON() : message;
    const payload = value?.payload || value?.proposal || null;
    return {
        sender: value?.sender,
        text: clamp(value?.text, 700),
        kind: value?.kind || 'text',
        ...(payload && ['workflow_proposal', 'clarification'].includes(value?.kind) ? {
            context: {
                status: value.proposalStatus || payload.status || null,
                requirements: (payload.requirements || []).slice(0, 10),
                diff: payload.diff || null,
                inputs: payload.inputs || null
            }
        } : {})
    };
};

const compactPending = pending => {
    if (!pending) return null;
    const payload = pending.payload || pending.proposal || pending;
    return {
        status: pending.proposalStatus || payload.status || 'pending',
        requirements: (payload.requirements || []).slice(0, 20),
        operations: (payload.operations || []).slice(0, 50),
        diff: payload.diff || null,
        plan: payload.plan || null
    };
};

const compactCatalogue = catalogue => (catalogue || []).map(item => ({
    nodeKey: item.nodeKey,
    type: item.type,
    subType: item.subType,
    title: item.title,
    description: clamp(item.description, 240),
    implementationStatus: item.implementationStatus,
    inputs: item.inputs,
    outputs: item.outputs
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
    forceDecision = false
}) => [
    'Current Workflow Edit View:',
    JSON.stringify(buildWorkflowEditView(workflow)),
    '',
    'Available Node Catalogue:',
    JSON.stringify(compactCatalogue(catalogue)),
    '',
    'Clarification Mode:',
    `${normalizeClarificationMode(clarificationMode)} - ${getClarificationModeInstruction(clarificationMode)}`,
    forceDecision ? 'Choose sensible defaults now. Ask again only when execution or safety is blocked.' : '',
    '',
    'Resolved Turn Context:',
    turnContext ? JSON.stringify(turnContext) : '(none)',
    '',
    'Available Owned Resources:',
    userContext ? JSON.stringify(userContext) : '(none)',
    '',
    'Recent Conversation:',
    JSON.stringify(history.slice(-MAX_HISTORY).map(compactHistoryMessage)),
    '',
    'Pending Unapplied Proposal:',
    JSON.stringify(compactPending(pendingProposal)),
    '',
    'Current Request:',
    clamp(request)
].join('\n');

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
        id: formSchema.id,
        title: formSchema.title,
        fields: (formSchema.fields || []).map(field => ({
            id: field.id,
            label: field.label,
            type: field.type,
            required: field.required === true
        })),
        respondentEmailFieldId: formSchema.respondentEmailFieldId || formSchema.settings?.respondentEmailFieldId || null
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
