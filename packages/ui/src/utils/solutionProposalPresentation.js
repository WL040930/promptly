import { displayWorkflowActionLabel, displayWorkflowNodeLabel, displayWorkflowResourceDetail, displayWorkflowResourceLabel } from './workflowLabels.js';

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

const artifactContentFor = (proposal, type) => {
    const artifact = (Array.isArray(proposal?.solution) ? proposal.solution : [])
        .find(item => item?.type === type);
    return isObject(artifact?.content) ? artifact.content : null;
};

const nodeLabelFor = node => displayWorkflowNodeLabel({
    ...node,
    label: node?.label || node?.data?.label,
    name: node?.name || node?.data?.name
});

const outcomeFor = (plan, type) => (Array.isArray(plan?.outcomes) ? plan.outcomes : [])
    .find(outcome => (outcome?.artifactTypes || []).includes(type));

export const compoundProposalPresentation = proposal => {
    const plan = isObject(proposal?.plan) ? proposal.plan : {};
    const form = artifactContentFor(proposal, 'form_proposal') || (proposal?.schema ? proposal : null);
    const workflow = artifactContentFor(proposal, 'workflow_proposal');
    const formSchema = isObject(form?.schema) ? form.schema : {};
    const workflowNodes = Array.isArray(workflow?.nodes) ? workflow.nodes : [];
    const workflowPresentation = isObject(workflow?.presentation) ? workflow.presentation : {};
    const flow = Array.isArray(workflowPresentation.flow) && workflowPresentation.flow.length > 0
        ? workflowPresentation.flow.map(item => isObject(item) ? nodeLabelFor(item) : displayWorkflowActionLabel(item)).filter(Boolean)
        : workflowNodes.map(nodeLabelFor);
    const formFields = Array.isArray(formSchema.fields)
        ? formSchema.fields.filter(field => field && field.deleted !== true)
        : [];
    const resourceChanges = Array.isArray(workflow?.resourceChanges)
        ? workflow.resourceChanges.filter(isObject).map(change => ({
            ...change,
            displayLabel: displayWorkflowResourceLabel(change),
            displayDetail: displayWorkflowResourceDetail(change)
        }))
        : [];

    return {
        plan,
        form,
        workflow,
        formOutcome: outcomeFor(plan, 'form_proposal'),
        workflowOutcome: outcomeFor(plan, 'workflow_proposal'),
        formTitle: String(formSchema.title || 'New form').trim(),
        formFields,
        workflowTitle: String(workflow?.name || workflowPresentation.title || 'New automation').trim(),
        workflowNodes,
        flow,
        resourceChanges,
        workflowReadiness: workflow?.readiness || null
    };
};

export const solutionArtifactFor = (proposal, type) => artifactContentFor(proposal, type);
