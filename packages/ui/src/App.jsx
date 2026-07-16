import React, { useEffect, useState, Suspense } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { getAuthUser, setAuthUser, getAuthToken, clearAuthUser, clearAuthToken } from './utils/storage.js'
import { useMe } from './api/hooks/useMe.js'
import { getDashboardPath, getRouteState, navigate } from './utils/router.js'

const LandingPage = React.lazy(() => import('./landing/LandingPage.jsx'))
const LoginPage = React.lazy(() => import('./auth/LoginPage.jsx'))
const RegisterPage = React.lazy(() => import('./auth/RegisterPage.jsx'))
const ForgotPasswordPage = React.lazy(() => import('./auth/ForgotPasswordPage.jsx'))
const ResetPasswordPage = React.lazy(() => import('./auth/ResetPasswordPage.jsx'))
const DashboardShell = React.lazy(() => import('./dashboard/DashboardShell'))
const OnboardingPage = React.lazy(() => import('./onboarding/OnboardingPage'))
const ChatView = React.lazy(() => import('./chat/ChatView'))
const WorkflowBuilderView = React.lazy(() => import('./builder/WorkflowBuilderView'))
const SecurityPage = React.lazy(() => import('./landing/SecurityPage.jsx'))
const PublicFormView = React.lazy(() => import('./forms/PublicFormView.jsx'))

function AppLoadingFallback() {
    return (
        <div className="app-center-page">
            <div className="app-loading-spinner"></div>
        </div>
    )
}

function App() {
    const [path, setPath] = useState(typeof window !== 'undefined' ? window.location.pathname : '/')
    const queryClient = useQueryClient()
    const hasAuthToken = Boolean(getAuthToken())
    const cachedUser = getAuthUser()
    const { data: remoteUser, isPending: isUserLoading } = useMe({ enabled: hasAuthToken })
    const user = hasAuthToken ? (remoteUser ?? cachedUser) : null
    const isLoading = hasAuthToken && isUserLoading && !cachedUser

    useEffect(() => {
        const handler = () => setPath(window.location.pathname)
        window.addEventListener('popstate', handler)
        return () => window.removeEventListener('popstate', handler)
    }, [])

    useEffect(() => {
        const route = getRouteState(path)

        if (user && !route.isDashboard && !route.isResetPassword && !route.isPublicForm) {
            goTo(getDashboardPath(user))
        } else if (!user && route.isDashboard) {
            goTo('/login')
        }
    }, [user, path])

    const goTo = (nextPath) => {
        navigate(nextPath)
    }

    const handleUserUpdate = (updatedUser) => {
        setAuthUser(updatedUser)
        queryClient.setQueryData(['me'], updatedUser)
    }

    const handleLoginSuccess = (payload) => {
        if (payload?.user) {
            handleUserUpdate(payload.user)
            goTo(getDashboardPath(payload.user))
        }
    }

    const handleLogout = () => {
        clearAuthUser()
        clearAuthToken()
        queryClient.setQueryData(['me'], null)
        goTo('/')
    }

    const route = getRouteState(path)

    if (route.isPublicForm) {
        return <PublicFormView />
    }

    if (isLoading) {
        return <AppLoadingFallback />
    }

    if (route.isDashboard && user) {
        if (!user.experienceLevel) {
            return (
                <OnboardingPage
                    user={user}
                    onOnboardingComplete={handleUserUpdate}
                />
            )
        }

        return (
            <DashboardShell
                user={user}
                onUserUpdate={handleUserUpdate}
                onLogout={handleLogout}
            >
                {user.experienceLevel === 'chat' ? (
                    <ChatView user={user} />
                ) : (
                    <WorkflowBuilderView />
                )}
            </DashboardShell>
        )
    }

    if (route.isLogin) {
        return (
            <LoginPage
                onRegister={() => goTo('/register')}
                onLoginSuccess={handleLoginSuccess}
            />
        )
    }

    if (route.isRegister) {
        return (
            <RegisterPage
                onLogin={() => goTo('/login')}
                onLoginSuccess={handleLoginSuccess}
            />
        )
    }

    if (route.isForgotPassword) {
        return <ForgotPasswordPage onLogin={() => goTo('/login')} />
    }

    if (route.isResetPassword) {
        const token = route.pathname.split('/').pop()
        return <ResetPasswordPage token={token} onLogin={() => goTo('/login')} />
    }

    if (route.isSecurity) {
        return <SecurityPage onHome={() => goTo('/')} onLogin={() => goTo('/login')} />
    }

    return <LandingPage onLogin={() => goTo('/login')} onSecurity={() => goTo('/landing/security')} />
}

export default function RootApp() {
    return (
        <Suspense fallback={<AppLoadingFallback />}>
            <App />
        </Suspense>
    )
}
