import { apiRequest, apiBase } from './client.js';
import { getAuthToken } from '../utils/storage.js';
// --- Workflows ---
export const getWorkflows = () => apiRequest('/api/workflows');
export const getWorkflow = (id) => apiRequest(`/api/workflows/${id}`);
export const createWorkflow = (data) => apiRequest('/api/workflows', { method: 'POST', body: JSON.stringify(data) });
export const updateWorkflow = (id, data) => apiRequest(`/api/workflows/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteWorkflow = (id) => apiRequest(`/api/workflows/${id}`, { method: 'DELETE' });
export const triggerWorkflow = (id, payload) => apiRequest(`/api/workflows/${id}/trigger`, { method: 'POST', body: JSON.stringify({ payload }) });
export const getWorkflowVersions = (id) => apiRequest(`/api/workflows/${id}/versions`);
export const saveWorkflowVersion = (id) => apiRequest(`/api/workflows/${id}/versions`, { method: 'POST' });
export const restoreWorkflowVersion = (id, versionId) => apiRequest(`/api/workflows/${id}/versions/${versionId}/restore`, { method: 'POST' });

// --- Folders ---
export const getFolders = () => apiRequest('/api/folders');
export const createFolder = (data) => apiRequest('/api/folders', { method: 'POST', body: JSON.stringify(data) });
export const updateFolder = (id, data) => apiRequest(`/api/folders/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteFolder = (id) => apiRequest(`/api/folders/${id}`, { method: 'DELETE' });

// --- Forms ---
export const getForms = () => apiRequest('/api/forms');
export const getForm = (id) => apiRequest(`/api/forms/${id}`);
export const createForm = (data) => apiRequest('/api/forms', { method: 'POST', body: JSON.stringify(data) });
export const updateForm = (id, data) => apiRequest(`/api/forms/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteForm = (id) => apiRequest(`/api/forms/${id}`, { method: 'DELETE' });
export const submitFormResponse = (formId, responseData) => apiRequest(`/api/forms/${formId}/responses`, { method: 'POST', body: JSON.stringify({ responseData }) });
export const getFormResponses = (formId) => apiRequest(`/api/forms/${formId}/responses`);
export const getPublicForm = (id) => apiRequest(`/api/forms/public/${id}`);
export const generateFormFromPrompt = (prompt, currentSchema, formId) => apiRequest('/api/forms/generate', { method: 'POST', body: JSON.stringify({ prompt, currentSchema, formId }) });

export const getFormChatHistory = (formId, limit = 50, offset = 0) => apiRequest(`/api/forms/${formId}/chat?limit=${limit}&offset=${offset}`);
export const addFormChatMessage = (formId, messageData) => apiRequest(`/api/forms/${formId}/chat`, { method: 'POST', body: JSON.stringify(messageData) });
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
    return apiRequest(`/api/logs${queryString ? '?' + queryString : ''}`);
};

export const getExecutionLog = (id) => apiRequest(`/api/logs/${id}`);

// --- Dashboard ---
export const getDashboardMetrics = () => apiRequest('/api/dashboard/metrics');

// --- Chat ---
export const getChatSessions = () => apiRequest('/api/chat/sessions');
export const sendChatMessage = (sessionId, message, context = {}, event = null) => apiRequest('/api/chat/message', {
    method: 'POST',
    body: JSON.stringify({ sessionId, message, context, ...(event ? { event } : {}) })
});
export const getChatSession = (sessionId) => apiRequest(`/api/chat/session/${sessionId}`);
export const updateChatSession = (sessionId, title) => apiRequest(`/api/chat/session/${sessionId}`, { method: 'PUT', body: JSON.stringify({ title }) });
export const deleteChatSession = (sessionId) => apiRequest(`/api/chat/session/${sessionId}`, { method: 'DELETE' });
