import { apiRequest } from './client.js';
// --- Automations ---
export const getWorkflows = () => apiRequest('/api/automations');
export const getWorkflow = (id) => apiRequest(`/api/automations/${id}`);
export const createWorkflow = (data) => apiRequest('/api/automations', { method: 'POST', body: JSON.stringify(data) });
export const updateWorkflow = (id, data) => apiRequest(`/api/automations/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const publishWorkflow = (id) => apiRequest(`/api/automations/${id}/publish`, { method: 'POST' });
export const pauseWorkflow = (id) => apiRequest(`/api/automations/${id}/pause`, { method: 'POST' });
export const deleteWorkflow = (id) => apiRequest(`/api/automations/${id}`, { method: 'DELETE' });
export const triggerWorkflow = (id, payload, revisionId = null) => apiRequest(`/api/automations/${id}/test`, { method: 'POST', body: JSON.stringify({ payload, ...(revisionId ? { revisionId } : {}) }) });
export const getWorkflowVersions = (id) => apiRequest(`/api/automations/${id}/versions`);
export const saveWorkflowVersion = (id) => apiRequest(`/api/automations/${id}/versions`, { method: 'POST' });
export const restoreWorkflowVersion = (id, versionId) => apiRequest(`/api/automations/${id}/versions/${versionId}/restore`, { method: 'POST' });

// --- Forms ---
export const getForms = () => apiRequest('/api/forms');
export const getForm = (id) => apiRequest(`/api/forms/${id}`);
export const createForm = (data) => apiRequest('/api/forms', { method: 'POST', body: JSON.stringify(data) });
export const updateForm = (id, data) => apiRequest(`/api/forms/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const acceptFormProposal = (formId, messageId, data) => apiRequest(`/api/forms/${formId}/ai-proposals/${messageId}/accept`, { method: 'POST', body: JSON.stringify(data) });
export const deleteForm = (id) => apiRequest(`/api/forms/${id}`, { method: 'DELETE' });
export const submitFormResponse = (formId, responseData) => apiRequest(`/api/forms/${formId}/responses`, { method: 'POST', body: JSON.stringify({ responseData }) });
export const getFormResponses = (formId) => apiRequest(`/api/forms/${formId}/responses`);
export const getPublicForm = (id) => apiRequest(`/api/forms/public/${id}`);
export const getFormChatHistory = (formId, limit = 50, offset = 0) => apiRequest(`/api/forms/${formId}/chat?limit=${limit}&offset=${offset}`);
export const updateFormChatMessage = (messageId, updates) => apiRequest(`/api/forms/chat/${messageId}`, { method: 'PUT', body: JSON.stringify(updates) });

// --- Logs ---
export const getExecutionLogs = ({ search = '', status = 'All', workflowId = '', page = 1, pageSize = 10 } = {}) => {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (status && status !== 'All') params.append('status', status);
    if (workflowId) params.append('workflowId', workflowId);
    params.append('page', page);
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
