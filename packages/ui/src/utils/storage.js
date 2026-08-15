import { isClarificationMode } from '../../../shared/agentContract.js';

const TOKEN_KEY = 'auth_token';
const USER_KEY = 'auth_user';
const CLARIFICATION_MODE_KEY = 'promptly_clarification_mode';
const EDITOR_PREFERENCE_KEY = 'promptly.default-editor';

export const EDITOR_PREFERENCES = Object.freeze({
    AI: 'ai',
    VISUAL: 'visual'
});

export const isEditorPreference = value => Object.values(EDITOR_PREFERENCES).includes(value);

const getLocalStorage = () => {
    if (typeof window === 'undefined') return null;
    try {
        return window.localStorage;
    } catch {
        return null;
    }
};

export const getEditorPreference = () => {
    const storage = getLocalStorage();
    if (!storage) return EDITOR_PREFERENCES.AI;
    try {
        const value = storage.getItem(EDITOR_PREFERENCE_KEY);
        return isEditorPreference(value) ? value : EDITOR_PREFERENCES.AI;
    } catch {
        return EDITOR_PREFERENCES.AI;
    }
};

export const setEditorPreference = value => {
    if (!isEditorPreference(value)) return;
    const storage = getLocalStorage();
    try {
        storage?.setItem(EDITOR_PREFERENCE_KEY, value);
    } catch {
        // Browser storage is best effort.
    }
};

export const getPreferredEditorForNewAutomation = () => {
    return getEditorPreference();
};

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

const getClarificationModePreference = () => {
    if (typeof window === 'undefined') return null;
    try {
        const value = localStorage.getItem(CLARIFICATION_MODE_KEY);
        return isClarificationMode(value) ? value : null;
    } catch {
        return null;
    }
};

const setClarificationModePreference = value => {
    if (typeof window === 'undefined' || !isClarificationMode(value)) return;
    try {
        localStorage.setItem(CLARIFICATION_MODE_KEY, value);
    } catch {
        // Storage can be unavailable in private browsing or restricted contexts.
    }
};

export {
    getAuthToken,
    setAuthToken,
    clearAuthToken,
    getAuthUser,
    setAuthUser,
    clearAuthUser,
    getClarificationModePreference,
    setClarificationModePreference
};
