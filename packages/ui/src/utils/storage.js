const TOKEN_KEY = 'auth_token';
const USER_KEY = 'auth_user';

const getAuthToken = () => localStorage.getItem(TOKEN_KEY);
const setAuthToken = (token) => localStorage.setItem(TOKEN_KEY, token);
const clearAuthToken = () => localStorage.removeItem(TOKEN_KEY);

const getAuthUser = () => {
    try {
        const userStr = localStorage.getItem(USER_KEY);
        return userStr ? JSON.parse(userStr) : null;
    } catch {
        return null;
    }
};

const setAuthUser = (user) => {
    if (user) {
        localStorage.setItem(USER_KEY, JSON.stringify(user));
    } else {
        localStorage.removeItem(USER_KEY);
    }
};

const clearAuthUser = () => localStorage.removeItem(USER_KEY);

export { getAuthToken, setAuthToken, clearAuthToken, getAuthUser, setAuthUser, clearAuthUser };
