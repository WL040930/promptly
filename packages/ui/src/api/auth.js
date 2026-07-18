import { apiRequest } from './client.js';
import { setAuthToken } from '../utils/storage.js';

const login = async (credentials) => {
    const payload = await apiRequest('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(credentials)
    });

    if (payload?.token) {
        setAuthToken(payload.token);
    }

    return payload;
};

const register = async (details) => {
    const payload = await apiRequest('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(details)
    });

    if (payload?.token) {
        setAuthToken(payload.token);
    }

    return payload;
};

const forgotPassword = async (email) => {
    return await apiRequest('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email })
    });
};

const resetPassword = async (token, password) => {
    return await apiRequest(`/api/auth/reset-password/${token}`, {
        method: 'POST',
        body: JSON.stringify({ password })
    });
};

const completeOnboarding = () => apiRequest('/api/onboarding/complete', {
    method: 'POST'
});

const changePassword = (newPassword) => apiRequest('/api/auth/change-password', {
    method: 'PUT',
    body: JSON.stringify({ newPassword })
});

const disconnectGoogle = () => apiRequest('/api/auth/google/disconnect', {
    method: 'POST'
});

const getGoogleConnectUrl = () => apiRequest('/api/auth/google/connect');

export {
    login,
    register,
    forgotPassword,
    resetPassword,
    completeOnboarding,
    changePassword,
    disconnectGoogle,
    getGoogleConnectUrl
};
