import { buildFormBindingCatalogue } from '../../../../../shared/workflowExpressions.js';
import { parseRecipients } from '../../../../../nodes/integrations/generic-connectors/send-email/emailConnector.js';

const activeFields = formSchema => (formSchema?.fields || [])
    .filter(field => field?.id && !field.deleted && !['heading', 'hidden'].includes(field.type));

const text = value => String(value || '').trim();

const formSubmissionPattern = /\b(?:when|after|once|whenever)\b[\s\S]{0,120}\b(?:submit(?:s|ted|ting)?|submission|response|feedback)\b|\bform[- ]submission\b|\bform\s+(?:response|submission)\b/i;
const externalFormPattern = /\bgoogle\s+forms?\b/i;
const ratingPattern = /\b(?:rating|score)\b/i;
const supportNotificationPattern = /\b(?:notify|alert|email|message)\b[\s\S]{0,50}\b(?:support|customer\s+service)\b|\b(?:support|customer\s+service)\b[\s\S]{0,50}\b(?:notify|alert|email|message)\b/i;
const respondentOfferPattern = /\b(?:compensation|refund|reimbursement|credit|offer)\b/i;

export const isFormSubmissionRequest = ({ request = '', workflow = {} } = {}) => {
    const source = text(request);
    if (externalFormPattern.test(source)) return false;
    const hasAttachedPromptlyForm = (workflow?.nodes || []).some(node => node?.subType === 'form-submission');
    return formSubmissionPattern.test(source)
        || (hasAttachedPromptlyForm && (needsRatingCondition(source) || needsRespondentOffer(source)));
};

export const needsRatingCondition = request => ratingPattern.test(text(request));
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
