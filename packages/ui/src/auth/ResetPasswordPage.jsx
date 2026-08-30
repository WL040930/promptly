import { useState } from 'react'
import { resetPassword } from '../api/auth.js'
import AuthShell from './components/AuthShell.jsx'
import { PASSWORD_REQUIREMENTS_ERROR, PASSWORD_REQUIREMENTS_HINT, isValidPassword } from '../../../shared/passwordPolicy.js'

const ResetPasswordPage = ({ token, onLogin }) => {
    const [password, setPassword] = useState('')
    const [message, setMessage] = useState(null)
    const [error, setError] = useState(null)
    const [isSubmitting, setIsSubmitting] = useState(false)

    const handleSubmit = async (event) => {
        event.preventDefault()
        if (!isValidPassword(password)) { setError(PASSWORD_REQUIREMENTS_ERROR); return }
        setIsSubmitting(true); setError(null); setMessage(null)
        try { setMessage((await resetPassword(token, password)).message || 'Your password has been reset.') }
        catch (err) { setError(err?.message || 'This reset link is invalid or has expired. Request a new one and try again.') }
        finally { setIsSubmitting(false) }
    }

    return <AuthShell step="Account recovery" title={message ? 'Password updated.' : 'Choose a new password.'} subtitle={message ? 'Your account is ready when you are.' : 'Make it memorable and keep your workspace protected.'} icon={<svg viewBox="0 0 24 24" fill="none"><rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v2"/></svg>}>
        {message ? <div className="auth-success">
            <div className="auth-success-mark">✓</div><h3>All set</h3><p>{message}</p>
            <button className="auth-submit" type="button" onClick={onLogin}>Sign in to Promptly <b>→</b></button>
        </div> : <>
            <form className="auth-form" onSubmit={handleSubmit}>
                <label className="auth-field"><span>New password</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Choose a secure password" autoComplete="new-password" required autoFocus /></label>
                <p className="auth-hint">{PASSWORD_REQUIREMENTS_HINT}</p>
                {error && <div className="auth-alert" role="alert"><span>!</span><p>{error}</p></div>}
                <button className="auth-submit" type="submit" disabled={isSubmitting || !password.trim()}>{isSubmitting && <i className="auth-spinner" />}{isSubmitting ? 'Updating password…' : 'Update password'}<b>→</b></button>
            </form>
            <p className="auth-switch"><button type="button" onClick={onLogin}><span>←</span> Back to sign in</button></p>
        </>}
    </AuthShell>
}

export default ResetPasswordPage
