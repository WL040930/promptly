import React, { useEffect, useState } from 'react'
import LandingPage from './landing/LandingPage.jsx'
import LoginPage from './auth/LoginPage.jsx'

function App() {
    const [path, setPath] = useState(typeof window !== 'undefined' ? window.location.pathname : '/')

    useEffect(() => {
        const handler = () => setPath(window.location.pathname)
        window.addEventListener('popstate', handler)
        return () => window.removeEventListener('popstate', handler)
    }, [])

    const goTo = (nextPath) => {
        window.history.pushState({}, '', nextPath)
        setPath(nextPath)
    }

    const isLogin = path === '/login'

    if (isLogin) {
        return <LoginPage onBack={() => goTo('/')} />
    }

    return <LandingPage onLogin={() => goTo('/login')} />
}

export default App
