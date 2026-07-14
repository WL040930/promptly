import React, { createContext, useContext, useState, useCallback } from 'react';

const AIStreamContext = createContext(null);

export const AIStreamProvider = ({ children }) => {
    // Stores stream state keyed by id (e.g. formId or sessionId)
    const [streams, setStreams] = useState({});

    const setStreamState = useCallback((id, state) => {
        setStreams(prev => ({
            ...prev,
            [id]: { ...prev[id], ...state }
        }));
    }, []);

    const clearStreamState = useCallback((id) => {
        setStreams(prev => {
            const next = { ...prev };
            delete next[id];
            return next;
        });
    }, []);

    return (
        <AIStreamContext.Provider value={{ streams, setStreamState, clearStreamState }}>
            {children}
        </AIStreamContext.Provider>
    );
};

export const useAIStream = (id) => {
    const context = useContext(AIStreamContext);
    if (!context) {
        console.warn('useAIStream used outside of AIStreamProvider, falling back to dummy state');
        return { isTyping: false, progressLabel: 'Thinking...', setStreamState: () => {}, clearStreamState: () => {} };
    }
    
    return {
        isTyping: context.streams[id]?.isTyping || false,
        progressLabel: context.streams[id]?.progressLabel || 'Thinking...',
        setStreamState: (state) => context.setStreamState(id, state),
        clearStreamState: () => context.clearStreamState(id)
    };
};
