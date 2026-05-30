import React, { useEffect, useState } from 'react'
import LandingPage from './landing/LandingPage.jsx'
import LoginPage from './auth/LoginPage.jsx'
import RegisterPage from './auth/RegisterPage.jsx'
import { getAuthUser, setAuthUser } from './utils/storage.js'
import DashboardShell from './dashboard/DashboardShell'
import OnboardingModal from './onboarding/OnboardingModal'
import NewbieView from './chat/NewbieView'
import ProfessionalView from './professional/ProfessionalView'

function App() {
    const [path, setPath] = useState(typeof window !== 'undefined' ? window.location.pathname : '/')
    const [user, setUser] = useState(getAuthUser())

    useEffect(() => {
        const handler = () => setPath(window.location.pathname)
        window.addEventListener('popstate', handler)
        return () => window.removeEventListener('popstate', handler)
    }, [])

    useEffect(() => {
        // Recover session and redirect to dashboard if authenticated
        if (user && path !== '/dashboard') {
            goTo('/dashboard')
        } else if (!user && path === '/dashboard') {
            goTo('/login')
        }
    }, [user])

    const goTo = (nextPath) => {
        window.history.pushState({}, '', nextPath)
        setPath(nextPath)
    }

    const handleLoginSuccess = (payload) => {
        if (payload?.user) {
            setAuthUser(payload.user)
            setUser(payload.user)
            goTo('/dashboard')
        }
    }

    const handleLogout = () => {
        setUser(null)
        goTo('/')
    }

    const isLogin = path === '/login'
    const isRegister = path === '/register'
    const isDashboard = path === '/dashboard'

    if (isDashboard && user) {
        return (
            <DashboardShell
                user={user}
                onUserUpdate={(updatedUser) => {
                    setAuthUser(updatedUser)
                    setUser(updatedUser)
                }}
                onLogout={handleLogout}
            >
                {!user.experienceLevel ? (
                    <OnboardingModal
                        user={user}
                        onOnboardingComplete={(updatedUser) => {
                            setAuthUser(updatedUser)
                            setUser(updatedUser)
                        }}
                    />
                ) : user.experienceLevel === 'newbie' ? (
                    <NewbieView user={user} />
                ) : (
                    <ProfessionalView />
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

    return <LandingPage onLogin={() => goTo('/login')} />
}

export default App
