export const SETTINGS_MODAL_EVENT = 'promptly:open-settings-modal';

export const normalizeSettingsTab = tab => tab === 'connections' ? 'connections' : 'general';

export const settingsModalDetail = tab => ({ tab: normalizeSettingsTab(tab) });

export const requestSettingsModal = (tab = 'general', target = globalThis.window) => {
    if (!target?.dispatchEvent) return false;
    const EventConstructor = target.CustomEvent || globalThis.CustomEvent;
    if (typeof EventConstructor !== 'function') return false;
    target.dispatchEvent(new EventConstructor(SETTINGS_MODAL_EVENT, { detail: settingsModalDetail(tab) }));
    return true;
};

export const subscribeToSettingsModal = (handler, target = globalThis.window) => {
    if (!target?.addEventListener || typeof handler !== 'function') return () => {};
    const listener = event => handler(settingsModalDetail(event?.detail?.tab));
    target.addEventListener(SETTINGS_MODAL_EVENT, listener);
    return () => target.removeEventListener(SETTINGS_MODAL_EVENT, listener);
};
