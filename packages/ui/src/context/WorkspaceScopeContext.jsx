import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
    deleteOnboardingDemo,
    ensureOnboardingDemo,
    resetOnboardingDemo
} from '../api/onboarding.js';

const defaultValue = {
    scope: 'live',
    demoKey: null,
    isDemo: false,
    isDemoLoading: false,
    startDemo: async () => null,
    resetDemo: async () => null,
    exitDemo: () => {},
    removeDemo: async () => null
};

const WorkspaceScopeContext = createContext(defaultValue);

export function WorkspaceScopeProvider({ userId, children }) {
    const queryClient = useQueryClient();
    const [scope, setScope] = useState('live');
    const [demoKey, setDemoKey] = useState(null);
    const [isDemoLoading, setIsDemoLoading] = useState(false);

    useEffect(() => {
        setScope('live');
        setDemoKey(null);
    }, [userId]);

    const activateDemo = async (operation) => {
        if (isDemoLoading) return null;
        setIsDemoLoading(true);
        try {
            const result = await operation();
            setDemoKey(result?.demoKey || null);
            setScope('demo');
            await queryClient.invalidateQueries();
            return result;
        } finally {
            setIsDemoLoading(false);
        }
    };

    const startDemo = () => activateDemo(ensureOnboardingDemo);
    const resetDemo = () => activateDemo(resetOnboardingDemo);
    const exitDemo = () => {
        setScope('live');
        setDemoKey(null);
    };
    const removeDemo = async () => {
        if (isDemoLoading) return null;
        setIsDemoLoading(true);
        try {
            const result = await deleteOnboardingDemo();
            exitDemo();
            await queryClient.invalidateQueries();
            return result;
        } finally {
            setIsDemoLoading(false);
        }
    };

    const value = useMemo(() => ({
        scope,
        demoKey,
        isDemo: scope === 'demo',
        isDemoLoading,
        startDemo,
        resetDemo,
        exitDemo,
        removeDemo
    }), [scope, demoKey, isDemoLoading]);

    return <WorkspaceScopeContext.Provider value={value}>{children}</WorkspaceScopeContext.Provider>;
}

export function useWorkspaceScope() {
    return useContext(WorkspaceScopeContext);
}

