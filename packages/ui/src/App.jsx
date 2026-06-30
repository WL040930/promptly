import React, { useEffect, useState } from 'react'
import LandingPage from './landing/LandingPage.jsx'
import LoginPage from './auth/LoginPage.jsx'
import RegisterPage from './auth/RegisterPage.jsx'
import ForgotPasswordPage from './auth/ForgotPasswordPage.jsx'
import ResetPasswordPage from './auth/ResetPasswordPage.jsx'
import { getAuthUser, setAuthUser, getAuthToken, clearAuthUser, clearAuthToken } from './utils/storage.js'
import { apiRequest } from './api/client.js'
import DashboardShell from './dashboard/DashboardShell'
import OnboardingPage from './onboarding/OnboardingPage'
import ChatView from './chat/ChatView'
import WorkflowBuilderView from './builder/WorkflowBuilderView'
import SecurityPage from './landing/SecurityPage.jsx'
import PublicFormView from './forms/PublicFormView.jsx'

function App() {
    const [path, setPath] = useState(typeof window !== 'undefined' ? window.location.pathname : '/')
    const [user, setUser] = useState(getAuthUser())
    const [isLoading, setIsLoading] = useState(!!getAuthToken())

    useEffect(() => {
        const syncUser = async () => {
            if (getAuthToken()) {
                try {
                    const data = await apiRequest('/api/auth/me');
                    if (data?.user) {
                        setAuthUser(data.user);
                        setUser(data.user);
                    }
                } catch (err) {
                    console.error('Failed to sync user from database:', err);
                    if (err.status === 401) {
                        setUser(null);
                        clearAuthUser();
                        clearAuthToken();
                    }
                } finally {
                    setIsLoading(false);
                }
            } else {
                setIsLoading(false);
            }
        };
        syncUser();
    }, []);

    useEffect(() => {
        const handler = () => setPath(window.location.pathname)
        window.addEventListener('popstate', handler)
        return () => window.removeEventListener('popstate', handler)
    }, [])

    useEffect(() => {
        // Recover session and redirect to dashboard if authenticated
        const isAppPath = path.startsWith('/workflow') || path.startsWith('/chat');
        const isResetPasswordPath = path.startsWith('/reset-password/');
        const isPublicFormPath = path.startsWith('/f/');
        
        if (user && !isAppPath && !isResetPasswordPath && !isPublicFormPath) {
            goTo(user.experienceLevel === 'chat' ? '/chat/chat' : '/workflow/dashboard')
        } else if (!user && isAppPath) {
            goTo('/login')
        }
    }, [user, path])

    const goTo = (nextPath) => {
        window.history.pushState({}, '', nextPath)
        setPath(nextPath)
    }

    const handleLoginSuccess = (payload) => {
        if (payload?.user) {
            setAuthUser(payload.user)
            setUser(payload.user)
            goTo(payload.user.experienceLevel === 'chat' ? '/chat/chat' : '/workflow/dashboard')
        }
    }

    const handleLogout = () => {
        setUser(null)
        goTo('/')
    }

    const isLogin = path === '/login'
    const isRegister = path === '/register'
    const isForgotPassword = path === '/forgot-password'
    const isResetPassword = path.startsWith('/reset-password/')
    const isPublicForm = path.startsWith('/f/')
    const isDashboard = path.startsWith('/workflow') || path.startsWith('/chat')
    const isSecurity = path === '/landing/security' || path === '/security'

    if (isPublicForm) {
        return <PublicFormView />
    }

    if (isLoading) {
        return (
            <div className="min-h-screen bg-[#f7f9fc] flex items-center justify-center">
                <div className="w-8 h-8 rounded-full border-4 border-indigo-600 border-t-transparent animate-spin"></div>
            </div>
        )
    }

    if (isDashboard && user) {
        if (!user.experienceLevel) {
            return (
                <OnboardingPage
                    user={user}
                    onOnboardingComplete={(updatedUser) => {
                        setAuthUser(updatedUser)
                        setUser(updatedUser)
                    }}
                />
            )
        }

        return (
            <DashboardShell
                user={user}
                onUserUpdate={(updatedUser) => {
                    setAuthUser(updatedUser)
                    setUser(updatedUser)
                }}
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

    if (isLogin) {
        return (
            <LoginPage
                onBack={() => goTo('/')}
                onRegister={() => goTo('/register')}
                onLoginSuccess={handleLoginSuccess}
            />
        )
    }

    if (isRegister) {
        return (
            <RegisterPage
                onBack={() => goTo('/')}
                onLogin={() => goTo('/login')}
                onLoginSuccess={handleLoginSuccess}
            />
        )
    }

    if (isForgotPassword) {
        return <ForgotPasswordPage onLogin={() => goTo('/login')} />
    }

    if (isResetPassword) {
        const token = path.split('/').pop()
        return <ResetPasswordPage token={token} onLogin={() => goTo('/login')} />
    }

    if (isSecurity) {
        return <SecurityPage onHome={() => goTo('/')} onLogin={() => goTo('/login')} />
    }

    return <LandingPage onLogin={() => goTo('/login')} onSecurity={() => goTo('/landing/security')} />
}

export default App
