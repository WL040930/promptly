import React, { useEffect } from 'react';

export const useClickOutside = (ref, isEnabled, onClose) => {
    useEffect(() => {
        if (!isEnabled) return;
        const handler = (e) => {
            if (ref.current && !ref.current.contains(e.target)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [isEnabled, onClose, ref]);
};
