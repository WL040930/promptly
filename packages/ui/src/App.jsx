import React, { Suspense, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { setAuthUser, getAuthToken, clearAuthUser, clearAuthToken } from './utils/storage.js';
import { useMe } from './api/hooks/useMe.js';
import { getDashboardPath, getRouteState, navigate, parsePath } from './utils/router.js';
import AppLoadingSkeleton from './components/ui/AppLoadingSkeleton.jsx';
import WorkspaceShell from './workspace/WorkspaceShell.jsx';
import WorkspacePageRouter from './workspace/WorkspacePageRouter.jsx';
import { getAuthRedirect } from './utils/authNavigation.js';

const LandingPage = React.lazy(() => import('./landing/LandingPage.jsx'));
const LoginPage = React.lazy(() => import('./auth/LoginPage.jsx'));
const RegisterPage = React.lazy(() => import('./auth/RegisterPage.jsx'));
const ForgotPasswordPage = React.lazy(() => import('./auth/ForgotPasswordPage.jsx'));
const ResetPasswordPage = React.lazy(() => import('./auth/ResetPasswordPage.jsx'));
const OnboardingPage = React.lazy(() => import('./onboarding/OnboardingPage.jsx'));
const SecurityPage = React.lazy(() => import('./landing/SecurityPage.jsx'));
const PublicFormView = React.lazy(() => import('./forms/public/PublicFormView.jsx'));

function AppLoadingFallback() {
    return <AppLoadingSkeleton />;
}

function App() {
    const [locationKey, setLocationKey] = useState(() => window.location.href);
    const queryClient = useQueryClient();
    const hasAuthToken = Boolean(getAuthToken());
    const { data: remoteUser, isPending: isUserLoading } = useMe({ enabled: hasAuthToken });
    const user = hasAuthToken ? remoteUser : null;
    const isLoading = hasAuthToken && isUserLoading;

    useEffect(() => {
        const handler = () => setLocationKey(window.location.href);
        window.addEventListener('popstate', handler);
        return () => window.removeEventListener('popstate', handler);
    }, []);

    const routeState = useMemo(() => getRouteState(window.location.pathname), [locationKey]);
    const route = useMemo(() => parsePath(window.location.href), [locationKey]);

    useEffect(() => {
        const redirect = getAuthRedirect({ user, isLoading, routeState });
        if (redirect) navigate(redirect);
    }, [user, isLoading, routeState, locationKey]);

    const handleUserUpdate = (updatedUser) => {
        setAuthUser(updatedUser);
        queryClient.setQueryData(['me'], updatedUser);
    };

    const handleLoginSuccess = (payload) => {
        if (payload?.user) {
            handleUserUpdate(payload.user);
            navigate(payload.user.onboardingCompletedAt ? getDashboardPath() : '/onboarding');
        }
    };

    const handleLogout = () => {
        clearAuthUser();
        clearAuthToken();
        queryClient.setQueryData(['me'], null);
        navigate('/');
    };

    if (routeState.isPublicForm) return <PublicFormView />;
    if (isLoading) return <AppLoadingFallback />;

    if (routeState.isOnboarding && user) {
        return <OnboardingPage user={user} onOnboardingComplete={handleUserUpdate} />;
    }

    if (routeState.isDashboard && user) {
        return (
            <WorkspaceShell user={user} route={route} onLogout={handleLogout}>
                <WorkspacePageRouter route={route} />
            </WorkspaceShell>
        );
    }

    if (routeState.isLogin) return <LoginPage onRegister={() => navigate('/register')} onLoginSuccess={handleLoginSuccess} />;
    if (routeState.isRegister) return <RegisterPage onLogin={() => navigate('/login')} onLoginSuccess={handleLoginSuccess} />;
    if (routeState.isForgotPassword) return <ForgotPasswordPage onLogin={() => navigate('/login')} />;
    if (routeState.isResetPassword) return <ResetPasswordPage token={routeState.pathname.split('/').pop()} onLogin={() => navigate('/login')} />;
    if (routeState.isSecurity) return <SecurityPage onHome={() => navigate('/')} onLogin={() => navigate('/login')} />;
    return <LandingPage onLogin={() => navigate('/login')} onSecurity={() => navigate('/landing/security')} />;
}

export default function RootApp() {
    return <Suspense fallback={<AppLoadingFallback />}><App /></Suspense>;
}
