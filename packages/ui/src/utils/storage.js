const TOKEN_KEY = 'auth_token';

const getAuthToken = () => localStorage.getItem(TOKEN_KEY);
const setAuthToken = (token) => localStorage.setItem(TOKEN_KEY, token);
const clearAuthToken = () => localStorage.removeItem(TOKEN_KEY);

export { getAuthToken, setAuthToken, clearAuthToken };
