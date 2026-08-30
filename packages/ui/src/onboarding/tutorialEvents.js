export const requestTutorial = ({ scope = 'live' } = {}) => {
    window.dispatchEvent(new CustomEvent('promptly:open-tutorial', { detail: { scope } }));
};

