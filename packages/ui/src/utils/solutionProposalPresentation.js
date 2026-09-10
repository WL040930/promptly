import { displayWorkflowActionLabel, displayWorkflowNodeLabel, displayWorkflowResourceDetail, displayWorkflowResourceLabel } from './workflowLabels.js';

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

const artifactFor = (proposal, type) => (Array.isArray(proposal?.solution) ? proposal.solution : [])
    .find(item => item?.type === type) || null;

const artifactContentFor = (proposal, type) => {
    const artifact = artifactFor(proposal, type);
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
    const formArtifact = artifactFor(proposal, 'form_proposal');
    const form = (isObject(formArtifact?.content) ? formArtifact.content : null) || (proposal?.schema ? proposal : null);
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
    const previewFormIds = [...new Set([
        workflow?.formArtifactId ? `artifact:${workflow.formArtifactId}` : null,
        formArtifact?.id ? `artifact:${formArtifact.id}` : null,
        form?.formId || null
    ].filter(value => typeof value === 'string' && value.trim()))];
    const previewFormsById = Object.fromEntries(previewFormIds.map(formId => [
        formId,
        { ...formSchema, id: formId }
    ]));
    const workflowPreview = workflow
        ? { ...workflow, previewFormsById }
        : null;

    return {
        plan,
        form,
        workflow,
        workflowPreview,
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
