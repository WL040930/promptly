import { useState } from 'react'
import { login } from '../api/auth.js'
import { navigate } from '../utils/router.js'
import AuthShell from './components/AuthShell.jsx'

const Alert = ({ children }) => <div className="auth-alert" role="alert"><span>!</span><p>{children}</p></div>
const Spinner = () => <span className="auth-spinner" aria-hidden="true" />

const LoginPage = ({ onRegister, onLoginSuccess }) => {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState(null)
    const [isSubmitting, setIsSubmitting] = useState(false)

    const handleSubmit = async (event) => {
        event.preventDefault()
        setIsSubmitting(true); setError(null)
        try { onLoginSuccess?.(await login({ email, password })) }
        catch (err) { setError(err?.message || 'We could not sign you in. Check your details and try again.') }
        finally { setIsSubmitting(false) }
    }

    return <AuthShell step="Welcome back" title="Pick up where you left off." subtitle="Sign in to continue building clearer workflows." icon={<svg viewBox="0 0 24 24" fill="none"><path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3" /></svg>}>
        <form className="auth-form" onSubmit={handleSubmit}>
            <label className="auth-field"><span>Work email</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" autoComplete="email" required autoFocus /></label>
            <label className="auth-field"><span>Password <button type="button" onClick={() => navigate('/forgot-password')}>Forgot password?</button></span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" autoComplete="current-password" required /></label>
            {error && <Alert>{error}</Alert>}
            <button className="auth-submit" type="submit" disabled={isSubmitting || !email.trim() || !password.trim()}>{isSubmitting && <Spinner />}{isSubmitting ? 'Signing in…' : 'Sign in'}<b>→</b></button>
        </form>
        <p className="auth-switch">New to Promptly? <button type="button" onClick={onRegister}>Create an account <span>→</span></button></p>
    </AuthShell>
}

export default LoginPage
