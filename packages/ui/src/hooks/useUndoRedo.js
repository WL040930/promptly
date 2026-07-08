import { useState, useCallback } from 'react';

export function useUndoRedo(maxHistory = 20) {
    const [past, setPast] = useState([]);
    const [future, setFuture] = useState([]);

    const takeSnapshot = useCallback((currentState) => {
        setPast(prevPast => {
            const newPast = [...prevPast, currentState];
            // Enforce max history
            if (newPast.length > maxHistory) {
                return newPast.slice(newPast.length - maxHistory);
            }
            return newPast;
        });
        // Clear future whenever a new snapshot is taken
        setFuture([]);
    }, [maxHistory]);

    const undo = useCallback((currentState) => {
        if (past.length === 0) return null;
        const previousState = past[past.length - 1];
        setPast(prevPast => prevPast.slice(0, -1));
        setFuture(prevFuture => [currentState, ...prevFuture]);
        return previousState;
    }, [past]);

    const redo = useCallback((currentState) => {
        if (future.length === 0) return null;
        const nextState = future[0];
        setFuture(prevFuture => prevFuture.slice(1));
        setPast(prevPast => [...prevPast, currentState]);
        return nextState;
    }, [future]);

    return { takeSnapshot, undo, redo, canUndo: past.length > 0, canRedo: future.length > 0 };
}
