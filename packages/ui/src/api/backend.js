import { apiRequest } from './client.js';
// --- Automations ---
export const getWorkflows = () => apiRequest('/api/automations');
export const getWorkflowListPage = ({ page = 1, pageSize = 10, search = '', status = 'All', health = 'All' } = {}) => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (search) params.set('search', search);
    if (status !== 'All') params.set('status', status);
    if (health !== 'All') params.set('health', health);
    return apiRequest(`/api/automations/list?${params.toString()}`);
};
export const getWorkflow = (id) => apiRequest(`/api/automations/${id}`);
export const createWorkflow = (data) => apiRequest('/api/automations', { method: 'POST', body: JSON.stringify(data) });
export const updateWorkflow = (id, data) => apiRequest(`/api/automations/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const publishWorkflow = (id) => apiRequest(`/api/automations/${id}/publish`, { method: 'POST' });
export const pauseWorkflow = (id) => apiRequest(`/api/automations/${id}/pause`, { method: 'POST' });
export const deleteWorkflow = (id) => apiRequest(`/api/automations/${id}`, { method: 'DELETE' });
export const triggerWorkflow = (id, payload, revisionId = null) => apiRequest(`/api/automations/${id}/test`, { method: 'POST', body: JSON.stringify({ payload, ...(revisionId ? { revisionId } : {}) }) });
export const triggerProductionWorkflow = (id, payload = {}) => apiRequest(`/api/automations/${id}/run`, { method: 'POST', body: JSON.stringify({ payload }) });
export const getWorkflowVersions = (id, { page = 1, pageSize = 20, source = null } = {}) => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (source) params.set('source', source);
    return apiRequest(`/api/automations/${id}/versions?${params.toString()}`);
};
export const getWorkflowVersion = (id, versionId) => apiRequest(`/api/automations/${id}/versions/${versionId}`);
export const restoreWorkflowVersion = (id, versionId) => apiRequest(`/api/automations/${id}/versions/${versionId}/restore`, { method: 'POST' });
export const getWorkflowAIChat = (id, limit = 50, before = null) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (before) params.set('before', before);
    return apiRequest(`/api/automations/${id}/ai-chat?${params.toString()}`);
};
export const clearWorkflowAIChat = (id) => apiRequest(`/api/automations/${id}/ai-chat`, { method: 'DELETE' });
export const resetWorkflowAIContext = (id) => apiRequest(`/api/automations/${id}/ai-context`, { method: 'DELETE' });
export const decideWorkflowAIProposal = (workflowId, messageId, action = 'accept', expectedStateVersion = null) => apiRequest(`/api/automations/${workflowId}/ai-proposals/${messageId}/decision`, {
    method: 'POST',
    body: JSON.stringify({ action, ...(Number.isInteger(expectedStateVersion) ? { expectedStateVersion } : {}) })
});
export const getNodeResourceOptions = (resource, params = {}) => {
    const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== ''));
    return apiRequest(`/api/nodes/resources/${encodeURIComponent(resource)}${query.size ? `?${query.toString()}` : ''}`);
};

// --- Forms ---
export const getForms = () => apiRequest('/api/forms');
export const getForm = (id) => apiRequest(`/api/forms/${id}`);
export const createForm = (data) => apiRequest('/api/forms', { method: 'POST', body: JSON.stringify(data) });
export const updateForm = (id, data) => apiRequest(`/api/forms/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const decideFormProposal = (formId, messageId, data) => apiRequest(`/api/forms/${formId}/ai-proposals/${messageId}/decide`, { method: 'POST', body: JSON.stringify(data) });
export const deleteForm = (id) => apiRequest(`/api/forms/${id}`, { method: 'DELETE' });
export const submitFormResponse = (formId, responseData) => apiRequest(`/api/forms/${formId}/responses`, { method: 'POST', body: JSON.stringify({ responseData }) });
export const getFormResponses = (formId, { page = 1, pageSize = 25 } = {}) => apiRequest(`/api/forms/${formId}/responses?page=${page}&pageSize=${pageSize}`);
export const getPublicForm = (id) => apiRequest(`/api/forms/public/${id}`);
export const getFormChatHistory = (formId, limit = 50, offset = 0) => apiRequest(`/api/forms/${formId}/chat?limit=${limit}&offset=${offset}`);
export const clearFormAIChat = (formId) => apiRequest(`/api/forms/${formId}/chat`, { method: 'DELETE' });
export const resetFormAIContext = (formId) => apiRequest(`/api/forms/${formId}/ai-context`, { method: 'DELETE' });

// --- Logs ---
export const getExecutionLogs = ({ search = '', status = 'All', workflowId = '', cursor = null, pageSize = 10 } = {}) => {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (status && status !== 'All') params.append('status', status);
    if (workflowId) params.append('workflowId', workflowId);
    if (cursor) params.append('cursor', cursor);
    params.append('pageSize', pageSize);
    const queryString = params.toString();
    return apiRequest(`/api/runs${queryString ? '?' + queryString : ''}`);
};

export const getExecutionLog = (id) => apiRequest(`/api/runs/${id}`);

// --- Dashboard ---
export const getDashboardMetrics = () => apiRequest('/api/dashboard/metrics');

// --- Chat ---
export const getChatSessions = () => apiRequest('/api/conversations');
export const sendChatMessage = (sessionId, message, context = {}, event = null) => apiRequest('/api/conversations/message', {
    method: 'POST',
    body: JSON.stringify({ sessionId, message, context, ...(event ? { event } : {}) })
});
export const getChatSession = (sessionId) => apiRequest(`/api/conversations/${sessionId}`);
export const deleteChatSession = (sessionId) => apiRequest(`/api/conversations/${sessionId}`, { method: 'DELETE' });
export const approveAgentRun = (runId, idempotencyKey) => apiRequest(`/api/conversations/agent-runs/${runId}/approve`, {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({ idempotencyKey })
});
export const rejectAgentRun = (runId) => apiRequest(`/api/conversations/agent-runs/${runId}/reject`, { method: 'POST' });
export const decideChatProposal = (sessionId, messageId, action = 'approve', overrides = null) => apiRequest(`/api/assistant/proposals/${messageId}/decision`, {
    method: 'POST',
    body: JSON.stringify({ sessionId, action, ...(overrides ? { overrides } : {}) })
});
