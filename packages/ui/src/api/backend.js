import { apiRequest } from './client.js';

// --- Workflows ---
export const getWorkflows = () => apiRequest('/api/workflows');
export const createWorkflow = (data) => apiRequest('/api/workflows', { method: 'POST', body: JSON.stringify(data) });
export const updateWorkflow = (id, data) => apiRequest(`/api/workflows/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteWorkflow = (id) => apiRequest(`/api/workflows/${id}`, { method: 'DELETE' });
export const triggerWorkflow = (id, payload) => apiRequest(`/api/workflows/${id}/trigger`, { method: 'POST', body: JSON.stringify({ payload }) });

// --- Folders ---
export const getFolders = () => apiRequest('/api/folders');
export const createFolder = (data) => apiRequest('/api/folders', { method: 'POST', body: JSON.stringify(data) });
export const updateFolder = (id, data) => apiRequest(`/api/folders/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteFolder = (id) => apiRequest(`/api/folders/${id}`, { method: 'DELETE' });

// --- Forms ---
export const getForms = () => apiRequest('/api/forms');
export const createForm = (data) => apiRequest('/api/forms', { method: 'POST', body: JSON.stringify(data) });
export const updateForm = (id, data) => apiRequest(`/api/forms/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteForm = (id) => apiRequest(`/api/forms/${id}`, { method: 'DELETE' });
export const submitFormResponse = (formId, responseData) => apiRequest(`/api/forms/${formId}/responses`, { method: 'POST', body: JSON.stringify({ responseData }) });
export const getFormResponses = (formId) => apiRequest(`/api/forms/${formId}/responses`);

// --- Logs ---
export const getExecutionLogs = (search = '', status = 'All') => {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (status && status !== 'All') params.append('status', status);
    const queryString = params.toString();
    return apiRequest(`/api/logs${queryString ? '?' + queryString : ''}`);
};

// --- Dashboard ---
export const getDashboardMetrics = () => apiRequest('/api/dashboard/metrics');

// --- Chat ---
export const getChatSessions = () => apiRequest('/api/chat/sessions');
export const sendChatMessage = (sessionId, message) => apiRequest('/api/chat/message', { method: 'POST', body: JSON.stringify({ sessionId, message }) });
export const getChatSession = (sessionId) => apiRequest(`/api/chat/session/${sessionId}`);
