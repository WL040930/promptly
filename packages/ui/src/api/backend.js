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
export const getPublicForm = (id) => apiRequest(`/api/forms/public/${id}`);
export const generateFormFromPrompt = (prompt, currentSchema) => apiRequest('/api/forms/generate', { method: 'POST', body: JSON.stringify({ prompt, currentSchema }) });
export const getFormChatHistory = (formId, limit = 50, offset = 0) => apiRequest(`/api/forms/${formId}/chat?limit=${limit}&offset=${offset}`);
export const addFormChatMessage = (formId, messageData) => apiRequest(`/api/forms/${formId}/chat`, { method: 'POST', body: JSON.stringify(messageData) });
export const updateFormChatMessage = (messageId, updates) => apiRequest(`/api/forms/chat/${messageId}`, { method: 'PUT', body: JSON.stringify(updates) });

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
export const updateChatSession = (sessionId, title) => apiRequest(`/api/chat/session/${sessionId}`, { method: 'PUT', body: JSON.stringify({ title }) });
export const deleteChatSession = (sessionId) => apiRequest(`/api/chat/session/${sessionId}`, { method: 'DELETE' });
