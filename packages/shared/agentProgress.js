const STEP_LABELS = Object.freeze({
    understand: 'Understanding your request',
    research: 'Checking your workspace',
    plan: 'Planning the automation',
    design: 'Building a workflow proposal',
    verify: 'Checking the generated workflow',
    design_form: 'Designing the form',
    design_workflow: 'Building the workflow'
});

const STAGE_LABELS = Object.freeze({
    classify: 'Choosing the right steps',
    assemble: 'Configuring the workflow steps',
    patch: 'Updating the existing workflow'
});

export const getAgentProgressLabel = event => {
    if (!event?.type) return null;
    if (event.type === 'workflow.design.started' || event.type === 'workflow.design.progress') {
        return STAGE_LABELS[event.stage] || 'Building the workflow proposal';
    }
    if (event.type === 'step.started' || event.type === 'assistant_step_started') {
        const step = typeof event.step === 'string' ? event.step : event.step?.type;
        return STEP_LABELS[step] || `Working on ${String(step || 'your request').replaceAll('_', ' ')}`;
    }
    if (event.type === 'tool_started') return `Checking ${String(event.name || 'workspace').replaceAll('_', ' ')}`;
    if (event.type === 'plan.ready' || event.type === 'plan.revised') return 'Preparing a reviewable proposal';
    if (event.type === 'approval.required') return 'Waiting for your approval';
    if (event.type === 'run.completed') return event.status === 'awaiting_approval' ? 'Waiting for your approval' : 'Finished';
    return null;
};

