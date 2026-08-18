const normalizeOperations = value => Array.isArray(value)
    ? value.slice(0, 12).map(operation => ({
        domain: ['form', 'workflow', 'execution', 'integration'].includes(operation?.domain) ? operation.domain : null,
        action: ['create', 'modify', 'delete', 'connect', 'explain', 'debug'].includes(operation?.action) ? operation.action : 'create',
        target: String(operation?.target || '').trim().slice(0, 255),
        reason: String(operation?.reason || '').trim().slice(0, 500)
    })).filter(operation => operation.domain) : [];

const normalizeResourceInputs = value => Array.isArray(value)
    ? value.slice(0, 12).map(reference => ({
        type: ['form', 'workflow', 'execution'].includes(reference?.type) ? reference.type : 'workflow',
        query: String(reference?.query || '').trim().slice(0, 255),
        role: String(reference?.role || 'input').trim().slice(0, 80)
    })).filter(reference => reference.query) : [];

export const makeIntent = (value = {}) => ({
    goal: ['create', 'modify', 'delete', 'explain', 'debug', 'connect'].includes(value.goal) ? value.goal : 'create',
    domains: [...new Set((Array.isArray(value.domains) ? value.domains : []).filter(domain => ['form', 'workflow', 'execution', 'integration'].includes(domain)))],
    requestedOperations: normalizeOperations(value.requestedOperations || value.operations),
    resourceInputs: normalizeResourceInputs(value.resourceInputs),
    resourceReferences: Array.isArray(value.resourceReferences) ? value.resourceReferences.slice(0, 8).map(reference => ({
        type: ['form', 'workflow', 'execution'].includes(reference?.type) ? reference.type : 'workflow',
        query: String(reference?.query || '').trim().slice(0, 255)
    })).filter(reference => reference.query) : [],
    requirements: Array.isArray(value.requirements) ? value.requirements.slice(0, 20).map(item => String(item).trim().slice(0, 1000)).filter(Boolean) : [],
    constraints: Array.isArray(value.constraints) ? value.constraints.slice(0, 20).map(item => String(item).trim().slice(0, 1000)).filter(Boolean) : [],
    destructiveActions: Array.isArray(value.destructiveActions) ? value.destructiveActions.slice(0, 10).map(item => String(item).trim().slice(0, 500)).filter(Boolean) : [],
    missingInformation: Array.isArray(value.missingInformation) ? value.missingInformation.slice(0, 8).map(item => String(item).trim().slice(0, 500)).filter(Boolean) : [],
    confidence: Number.isFinite(Number(value.confidence)) ? Math.max(0, Math.min(1, Number(value.confidence))) : 0,
    risk: ['low', 'medium', 'high'].includes(value.risk) ? value.risk : 'medium'
});

export const makeError = (error) => ({
    code: error?.code || 'AGENT_RUN_FAILED',
    message: String(error?.message || 'The agent could not complete this request.').slice(0, 1000),
    issues: Array.isArray(error?.issues) ? error.issues.slice(0, 20) : [],
    ...(error?.preview ? { preview: error.preview } : {})
});
