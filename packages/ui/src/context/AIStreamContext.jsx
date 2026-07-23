import { createContext, useContext, useState, useCallback, useMemo } from 'react';

const AIStreamContext = createContext(null);

export const AIStreamProvider = ({ children }) => {
    // Stores stream state above the router so active turns survive navigation.
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

    const activeStreams = useMemo(() => Object.entries(streams)
        .filter(([, state]) => state?.isTyping === true)
        .map(([id, state]) => ({
            id,
            progressLabel: state.progressLabel || 'Working…',
            surface: state.surface || null,
            requestId: state.requestId || null,
            sessionId: state.sessionId || null
        })), [streams]);

    return (
        <AIStreamContext.Provider value={{ streams, setStreamState, clearStreamState, activeStreams }}>
            {children}
        </AIStreamContext.Provider>
    );
};

export const useAIActivity = () => {
    const context = useContext(AIStreamContext);
    if (!context) return { isAnyAIActive: false, activeStreams: [] };
    return {
        isAnyAIActive: context.activeStreams.length > 0,
        activeStreams: context.activeStreams
    };
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
