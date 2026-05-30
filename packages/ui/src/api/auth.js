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

export { login, register };
