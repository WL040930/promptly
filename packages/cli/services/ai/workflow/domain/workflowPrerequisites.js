import { buildFormBindingCatalogue, isWorkflowExpression } from '../../../../../shared/workflowExpressions.js';
import { parseRecipients } from '../../../../../nodes/integrations/generic-connectors/send-email/emailConnector.js';

const activeFields = formSchema => (formSchema?.fields || [])
    .filter(field => field?.id && !field.deleted && !['heading', 'hidden'].includes(field.type));

const text = value => String(value || '').trim();

const formSubmissionPattern = /\b(?:when|after|once|whenever|trigger(?:s|ed|ing)?)\b[\s\S]{0,120}\b(?:submit(?:s|ted|ting)?|submission(?:s)?|response(?:s)?|feedback)\b|\bform[- ]submission\b|\bform\s+(?:response|submission)\b/i;
const externalFormPattern = /\bgoogle\s+forms?\b/i;
const ratingPattern = /\b(?:rating|score)\b/i;
const aiSummaryPattern = /\b(?:summar(?:y|ies|ize|ized|izing|ise|ised|ising)|summarization)\b/i;
const wholeSubmissionPattern = /\b(?:entire|whole|full|complete)\s+(?:form\s+)?(?:submission|response|set of answers|answers|fields)\b|\b(?:all|every)\s+(?:submitted\s+)?(?:answers|responses|fields)\b/i;
const supportNotificationPattern = /\b(?:notify|alert|email|message)\b[\s\S]{0,50}\b(?:support|customer\s+service)\b|\b(?:support|customer\s+service)\b[\s\S]{0,50}\b(?:notify|alert|email|message)\b/i;
const respondentOfferPattern = /\b(?:compensation|refund|reimbursement|credit|offer)\b/i;
const summaryFieldTypes = new Set(['textarea', 'paragraph']);
const summaryFieldHints = new Set(['comment', 'comments', 'feedback', 'message', 'review', 'reason', 'explanation', 'detail', 'details', 'description', 'response', 'answer', 'answers']);

export const isFormSubmissionRequest = ({ request = '', workflow = {} } = {}) => {
    const source = text(request);
    if (externalFormPattern.test(source)) return false;
    const hasAttachedPromptlyForm = (workflow?.nodes || []).some(node => node?.subType === 'form-submission');
    return formSubmissionPattern.test(source)
        || (hasAttachedPromptlyForm && (needsRatingCondition(source) || needsRespondentOffer(source) || needsAiSummary(source)));
};

export const needsRatingCondition = request => ratingPattern.test(text(request));
export const needsAiSummary = request => aiSummaryPattern.test(text(request));
export const needsSupportRecipient = request => supportNotificationPattern.test(text(request));
export const needsRespondentOffer = request => respondentOfferPattern.test(text(request));

export const ratingFieldCandidates = formSchema => activeFields(formSchema).filter(field => {
    if (field.type === 'rating') return true;
    const label = `${field.label || ''} ${field.name || ''} ${field.id || ''}`;
    return field.type === 'number' && /\b(?:rating|score)\b/i.test(label);
});

export const fieldBindingKey = (formSchema, fieldId) => buildFormBindingCatalogue(formSchema).bindings
    .find(binding => binding.fieldId === fieldId)?.key || null;

const respondentCandidates = respondentEmail => (respondentEmail?.candidates || [])
    .map(candidate => candidate?.field || candidate)
    .filter(field => field?.id);

const fieldOptions = fields => fields.map(field => ({
    id: field.id,
    name: field.label || field.name || field.id,
    description: field.type || null
}));

const tokens = value => String(value || '').toLocaleLowerCase().match(/[a-z0-9]+/g) || [];
const summaryFieldCandidates = formSchema => activeFields(formSchema).filter(field => {
    if (summaryFieldTypes.has(field.type)) return true;
    if (field.type !== 'text') return false;
    return tokens(`${field.label || ''} ${field.name || ''} ${field.id || ''}`)
        .some(token => summaryFieldHints.has(token));
});

const explicitlyMentionedSummaryFields = (request, fields) => {
    const requestTokens = new Set(tokens(request));
    return fields.filter(field => tokens(`${field.label || ''} ${field.name || ''} ${field.id || ''}`)
        .some(token => requestTokens.has(token)));
};

const collectWorkflowReferences = (value, references = []) => {
    if (isWorkflowExpression(value)) {
        if (value.$expr === 'reference') references.push(value);
        if (value.$expr === 'template') (value.parts || []).forEach(part => collectWorkflowReferences(part, references));
        return references;
    }
    if (Array.isArray(value)) {
        value.forEach(item => collectWorkflowReferences(item, references));
        return references;
    }
    if (value && typeof value === 'object') {
        Object.values(value).forEach(item => collectWorkflowReferences(item, references));
    }
    return references;
};

const hasReference = (references, { nodeId, path }) => references.some(reference => (
    reference.nodeId === nodeId
    && Array.isArray(reference.path)
    && reference.path.length === path.length
    && reference.path.every((part, index) => part === path[index])
));

/**
 * Enforce the server-owned contract created during form prerequisite
 * resolution. This runs after bindings are compiled into canonical
 * expressions, so a plain prompt cannot accidentally summarize the entire
 * submission when the user selected one field.
 */
export const validateSummaryWorkflowContract = ({ nodes = [], contract = null } = {}) => {
    const summaryInput = contract?.summaryInput;
    if (!summaryInput) return [];

    const issues = [];
    const summaryNodes = (nodes || []).filter(node => (
        node?.subType === 'aiTask'
        && node?.config?.taskType === 'summarize'
    ));
    if (summaryNodes.length === 0) {
        issues.push({
            code: 'AI_SUMMARY_NODE_MISSING',
            path: 'nodes',
            message: 'The form summary contract requires a summarization AI node.'
        });
    }

    if (!['fields', 'submission'].includes(summaryInput.mode)) {
        issues.push({
            code: 'AI_SUMMARY_INPUT_MODE_INVALID',
            path: 'summaryInput.mode',
            message: 'The form summary input contract must select fields or the full submission.'
        });
    }

    if (summaryInput.mode === 'fields') {
        const fieldIds = Array.isArray(summaryInput.fieldIds) ? summaryInput.fieldIds.filter(Boolean) : [];
        const formTrigger = (nodes || []).find(node => node?.subType === 'form-submission');
        const promptReferences = summaryNodes.flatMap(node => collectWorkflowReferences(node.config?.prompt));
        if (fieldIds.length === 0 || !formTrigger?.id) {
            issues.push({
                code: 'AI_SUMMARY_INPUT_MISSING',
                path: 'summaryInput.fieldIds',
                message: 'The summary AI node must be bound to the selected form field.'
            });
        } else {
            for (const fieldId of fieldIds) {
                if (!hasReference(promptReferences, { nodeId: formTrigger.id, path: ['fields', fieldId] })) {
                    issues.push({
                        code: 'AI_SUMMARY_INPUT_MISSING',
                        path: 'summaryInput.fieldIds',
                        fieldId,
                        message: `The summary AI prompt is not bound to form field '${fieldId}'.`
                    });
                }
            }
        }
    }

    const summaryNodeIds = new Set(summaryNodes.map(node => node.id).filter(Boolean));
    const responseDelivered = (nodes || []).some(node => {
        if (node?.subType === 'aiTask') return false;
        const references = collectWorkflowReferences(node.config);
        return references.some(reference => (
            summaryNodeIds.has(reference.nodeId)
            && Array.isArray(reference.path)
            && reference.path.length === 1
            && reference.path[0] === 'response'
        ));
    });
    if (summaryNodes.length > 0 && !responseDelivered) {
        issues.push({
            code: 'AI_SUMMARY_OUTPUT_MISSING',
            path: 'nodes',
            message: 'The summary AI response must be referenced by the requested notification or email action.'
        });
    }

    return issues;
};

const supportRecipientIsValid = value => {
    if (!text(value)) return false;
    try {
        parseRecipients(value);
        return true;
    } catch {
        return false;
    }
};

export const formPrerequisiteDecision = ({ request = '', formSchema = null, respondentEmail = null, state = {} } = {}) => {
    const inputs = [];
    const context = {
        ratingFieldId: null,
        respondentEmailFieldId: null,
        supportRecipient: null
    };
    let blockedReason = null;
    const wantsSummary = needsAiSummary(request);
    if (wantsSummary) {
        context.summaryFieldId = null;
        context.summaryFieldIds = [];
        context.summaryMode = null;
    }

    if (needsRatingCondition(request)) {
        const candidates = ratingFieldCandidates(formSchema);
        const selected = candidates.find(field => field.id === state.ratingFieldId)
            || (candidates.length === 1 ? candidates[0] : null);
        if (candidates.length === 0) {
            blockedReason = 'RATING_FIELD_MISSING';
        } else if (!selected) {
            inputs.push({
                id: 'ratingFieldId',
                type: 'resource_choice',
                label: 'Rating field',
                resource: 'form-fields',
                options: fieldOptions(candidates)
            });
        } else {
            context.ratingFieldId = selected.id;
        }
    }

    if (needsRespondentOffer(request)) {
        const explicitRecipient = text(state.compensationRecipient);
        if (explicitRecipient) {
            if (supportRecipientIsValid(explicitRecipient)) {
                context.compensationRecipient = explicitRecipient;
            } else {
                inputs.push({
                    id: 'compensationRecipient',
                    type: 'text',
                    label: 'Valid compensation offer email address',
                    required: true
                });
            }
        } else {
            const candidates = respondentCandidates(respondentEmail);
            const selected = candidates.find(field => field.id === state.respondentEmailFieldId)
                || respondentEmail?.field
                || (candidates.length === 1 ? candidates[0] : null);
            if (!selected && candidates.length > 1) {
                inputs.push({
                    id: 'respondentEmailFieldId',
                    type: 'resource_choice',
                    label: 'Customer email field',
                    resource: 'form-fields',
                    options: fieldOptions(candidates)
                });
            } else if (!selected) {
                blockedReason = blockedReason || 'RESPONDENT_CONTACT_FIELD_MISSING';
            } else {
                context.respondentEmailFieldId = selected.id;
            }
        }
    }

    if (needsSupportRecipient(request)) {
        const recipient = text(state.supportRecipient);
        if (supportRecipientIsValid(recipient)) {
            context.supportRecipient = recipient;
        } else {
            inputs.push({
                id: 'supportRecipient',
                type: 'text',
                label: recipient ? 'Valid support email address' : 'Support email address',
                required: true
            });
        }
    }

    if (wantsSummary) {
        if (wholeSubmissionPattern.test(text(request))) {
            context.summaryMode = 'submission';
        } else {
            const candidates = summaryFieldCandidates(formSchema);
            const explicit = explicitlyMentionedSummaryFields(request, candidates);
            const eligible = explicit.length > 0 ? explicit : candidates;
            const selected = state.summaryFieldId && eligible.find(field => field.id === state.summaryFieldId)
                ? [eligible.find(field => field.id === state.summaryFieldId)]
                : eligible.length === 1
                    ? eligible
                    : [];

            if (selected.length === 1) {
                context.summaryFieldId = selected[0].id;
                context.summaryFieldIds = [selected[0].id];
                context.summaryMode = 'fields';
            } else if (eligible.length > 1) {
                inputs.push({
                    id: 'summaryFieldId',
                    type: 'resource_choice',
                    label: 'Summary field',
                    resource: 'form-fields',
                    options: fieldOptions(eligible)
                });
            } else {
                blockedReason = blockedReason || 'SUMMARY_FIELD_MISSING';
            }
        }
    }

    return {
        status: blockedReason ? 'blocked' : inputs.length > 0 ? 'clarification' : 'ready',
        blockedReason,
        inputs,
        context
    };
};

export const workflowPrerequisiteInternals = Object.freeze({
    activeFields,
    supportRecipientIsValid
});
