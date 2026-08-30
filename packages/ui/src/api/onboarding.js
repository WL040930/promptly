import { apiRequest } from './client.js';

export const getOnboardingContext = () => apiRequest('/api/onboarding/context');
export const ensureOnboardingDemo = () => apiRequest('/api/onboarding/demo/ensure', { method: 'POST' });
export const resetOnboardingDemo = () => apiRequest('/api/onboarding/demo/reset', { method: 'POST' });
export const deleteOnboardingDemo = () => apiRequest('/api/onboarding/demo', { method: 'DELETE' });

