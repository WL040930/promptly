import crypto from 'crypto';

export const AGENT_STATUSES = Object.freeze([
    'received',
    'understanding',
    'awaiting_clarification',
    'researching',
    'planning',
    'designing',
    'verifying',
    'awaiting_approval',
    'applying',
    'completed',
    'failed',
    'blocked'
]);

export const terminalStatuses = new Set(['completed', 'failed', 'blocked']);

export const makeIntent = (value = {}) => ({
    goal: ['create', 'modify', 'explain', 'debug', 'connect'].includes(value.goal) ? value.goal : 'create',
    domains: [...new Set((Array.isArray(value.domains) ? value.domains : []).filter(domain => ['form', 'workflow', 'integration'].includes(domain)))],
    resourceReferences: Array.isArray(value.resourceReferences) ? value.resourceReferences.slice(0, 8).map(reference => ({
        type: reference?.type === 'form' ? 'form' : 'workflow',
        query: String(reference?.query || '').trim().slice(0, 255)
    })).filter(reference => reference.query) : [],
    requirements: Array.isArray(value.requirements) ? value.requirements.slice(0, 20).map(item => String(item).trim().slice(0, 1000)).filter(Boolean) : [],
    constraints: Array.isArray(value.constraints) ? value.constraints.slice(0, 20).map(item => String(item).trim().slice(0, 1000)).filter(Boolean) : [],
    destructiveActions: Array.isArray(value.destructiveActions) ? value.destructiveActions.slice(0, 10).map(item => String(item).trim().slice(0, 500)).filter(Boolean) : [],
    missingInformation: Array.isArray(value.missingInformation) ? value.missingInformation.slice(0, 8).map(item => String(item).trim().slice(0, 500)).filter(Boolean) : [],
    confidence: Number.isFinite(Number(value.confidence)) ? Math.max(0, Math.min(1, Number(value.confidence))) : 0,
    risk: ['low', 'medium', 'high'].includes(value.risk) ? value.risk : 'medium'
});

export const makePlan = (value = {}, intent = {}) => ({
    id: value.id || `plan_${crypto.randomUUID().replace(/-/g, '')}`,
    summary: String(value.summary || 'Prepare the requested solution.').trim().slice(0, 2000),
    assumptions: Array.isArray(value.assumptions) ? value.assumptions.slice(0, 10).map(item => String(item).trim().slice(0, 500)).filter(Boolean) : [],
    affectedResources: Array.isArray(value.affectedResources) ? value.affectedResources.slice(0, 10) : [],
    steps: Array.isArray(value.steps) && value.steps.length > 0
        ? value.steps.slice(0, 12).map((step, index) => ({
            id: String(step?.id || `step_${index + 1}`).slice(0, 100),
            type: String(step?.type || 'design').slice(0, 60),
            title: String(step?.title || step?.type || `Step ${index + 1}`).slice(0, 255),
            description: String(step?.description || '').slice(0, 1000),
            dependsOn: Array.isArray(step?.dependsOn) ? step.dependsOn.slice(0, 8) : [],
            status: 'pending'
        }))
        : defaultPlanSteps(intent),
    approvalRequired: value.approvalRequired !== false
});

const defaultPlanSteps = (intent = {}) => {
    const steps = [];
    if ((intent.resourceReferences || []).length > 0) steps.push({ id: 'research', type: 'research', title: 'Review existing resources', description: 'Resolve and inspect the resources mentioned in the request.', dependsOn: [], status: 'pending' });
    if ((intent.domains || []).includes('form')) steps.push({ id: 'design_form', type: 'design_form', title: 'Design the form', description: 'Prepare a reviewable form proposal.', dependsOn: steps.length ? ['research'] : [], status: 'pending' });
    if ((intent.domains || []).includes('workflow')) steps.push({ id: 'design_workflow', type: 'design_workflow', title: 'Design the workflow', description: 'Prepare a reviewable workflow proposal.', dependsOn: steps.length ? [steps[steps.length - 1].id] : [], status: 'pending' });
    steps.push({ id: 'verify', type: 'verify', title: 'Verify the solution', description: 'Check the generated artifacts and their relationships.', dependsOn: steps.length ? [steps[steps.length - 1].id] : [], status: 'pending' });
    return steps;
};

export const makeError = (error) => ({
    code: error?.code || 'AGENT_RUN_FAILED',
    message: String(error?.message || 'The agent could not complete this request.').slice(0, 1000),
    issues: Array.isArray(error?.issues) ? error.issues.slice(0, 20) : []
});
