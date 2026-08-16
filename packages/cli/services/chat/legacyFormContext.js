import { AgentRun, Form } from '../../models/index.js';
import { mergeAgentContext } from './resourceResolver.js';

const appliedFormArtifact = run => (run?.artifacts || []).find(artifact =>
    artifact?.type === 'form_proposal' && artifact?.status === 'applied'
);

const shouldRecoverFormContext = ({ context = {}, decision = null }) => {
    if (context.formId || decision?.route !== 'agent') return false;

    const intent = decision?.intent || {};
    const referencesForm = intent.resourceReferences?.some(reference => reference?.type === 'form');
    if (!referencesForm) return false;

    const createsNewForm = intent.requestedOperations?.some(operation => (
        operation?.domain === 'form' && operation?.action === 'create'
    ));
    const editsForm = intent.goal === 'modify' && intent.domains?.includes('form');
    const usesFormAsWorkflowInput = intent.domains?.includes('workflow')
        && !createsNewForm
        && !editsForm;

    // A form reference can be the input to a new workflow. In that case the
    // most recently applied form in this Ask Promptly thread is the trusted
    // active resource, just as it is for a follow-up form edit.
    return editsForm || usesFormAsWorkflowInput;
};

export const recoverHistoricalFormContext = async ({
    threadId,
    userId,
    context = {},
    decision = null,
    models = { AgentRun, Form }
} = {}) => {
    if (!shouldRecoverFormContext({ context, decision })) return context;

    const runs = await models.AgentRun.findAll({
        where: { threadId, userId },
        order: [['updatedAt', 'DESC']],
        limit: 24
    });
    const artifact = runs.map(appliedFormArtifact).find(Boolean);
    if (!artifact) return context;

    const knownFormId = String(artifact.content?.formId || '').trim();
    if (knownFormId) return mergeAgentContext(context, { formId: knownFormId });

    const title = String(artifact.content?.schema?.title || '').trim();
    if (!title) return context;
    const candidates = await models.Form.findAll({
        where: { userId, title },
        attributes: ['id'],
        order: [['updatedAt', 'DESC']],
        limit: 2
    });
    return candidates.length === 1
        ? mergeAgentContext(context, { formId: candidates[0].id })
        : context;
};
