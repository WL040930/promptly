import { useState } from 'react'
import { register } from '../api/auth.js'
import AuthShell from './components/AuthShell.jsx'
import { PASSWORD_REQUIREMENTS_ERROR, PASSWORD_REQUIREMENTS_HINT, isValidPassword } from '../../../shared/passwordPolicy.js'

const RegisterPage = ({ onLogin, onLoginSuccess }) => {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [error, setError] = useState(null)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const passwordsMatch = !confirmPassword || password === confirmPassword

    const handleSubmit = async (event) => {
        event.preventDefault()
        if (password !== confirmPassword) { setError('The two passwords need to match.'); return }
        if (!isValidPassword(password)) { setError(PASSWORD_REQUIREMENTS_ERROR); return }
        setIsSubmitting(true); setError(null)
        try {
            const payload = await register({ email, password })
            if (onLoginSuccess) onLoginSuccess(payload)
            else onLogin?.()
        }
        catch (err) { setError(err?.message || 'We could not create your account. Please try again.') }
        finally { setIsSubmitting(false) }
    }

    return <AuthShell step="Start your workspace" title="Build your next workflow." subtitle="Create an account and turn busywork into momentum." icon={<svg viewBox="0 0 24 24" fill="none"><circle cx="9" cy="7" r="3.5"/><path d="M2.5 20v-1.5A4.5 4.5 0 0 1 7 14h4a4.5 4.5 0 0 1 4.5 4.5V20M18 8v6M21 11h-6"/></svg>}>
        <form className="auth-form" onSubmit={handleSubmit}>
            <label className="auth-field"><span>Work email</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" autoComplete="email" required autoFocus /></label>
            <label className="auth-field"><span>Create password</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Choose a secure password" autoComplete="new-password" required /></label>
            <label className={`auth-field ${!passwordsMatch ? 'is-invalid' : ''}`}><span>Confirm password</span><input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Repeat your password" autoComplete="new-password" required /></label>
            <p className="auth-hint">{PASSWORD_REQUIREMENTS_HINT}</p>
            {error && <div className="auth-alert" role="alert"><span>!</span><p>{error}</p></div>}
            <button className="auth-submit" type="submit" disabled={isSubmitting || !email.trim() || !password.trim() || !confirmPassword.trim()}>{isSubmitting && <i className="auth-spinner" />}{isSubmitting ? 'Creating account…' : 'Create account'}<b>→</b></button>
        </form>
        <p className="auth-switch">Already have an account? <button type="button" onClick={onLogin}>Sign in <span>→</span></button></p>
    </AuthShell>
}

export default RegisterPage
