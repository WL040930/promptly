import { useState } from 'react'
import { forgotPassword } from '../api/auth.js'
import AuthShell from './components/AuthShell.jsx'

const ForgotPasswordPage = ({ onLogin }) => {
    const [email, setEmail] = useState('')
    const [message, setMessage] = useState(null)
    const [error, setError] = useState(null)
    const [isSubmitting, setIsSubmitting] = useState(false)

    const handleSubmit = async (event) => {
        event.preventDefault()
        setIsSubmitting(true); setError(null); setMessage(null)
        try { setMessage((await forgotPassword(email)).message || 'If that address is registered, a reset link is on its way.') }
        catch (err) { setError(err?.message || 'We could not send that reset link. Please try again.') }
        finally { setIsSubmitting(false) }
    }

    return <AuthShell step="Account recovery" title={message ? 'Check your inbox.' : 'Let’s get you back in.'} subtitle={message ? 'Use the link in your email to choose a new password.' : 'Enter your email and we’ll send a secure reset link.'} icon={<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 8.2 5.3a1.5 1.5 0 0 0 1.6 0L21 7"/></svg>}>
        {message ? <div className="auth-success">
            <div className="auth-success-mark">✓</div><h3>Request received</h3><p>{message}</p>
            <button className="auth-submit" type="button" onClick={onLogin}>Back to sign in <b>→</b></button>
        </div> : <>
            <form className="auth-form" onSubmit={handleSubmit}>
                <label className="auth-field"><span>Work email</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" autoComplete="email" required autoFocus /></label>
                {error && <div className="auth-alert" role="alert"><span>!</span><p>{error}</p></div>}
                <button className="auth-submit" type="submit" disabled={isSubmitting || !email.trim()}>{isSubmitting && <i className="auth-spinner" />}{isSubmitting ? 'Sending link…' : 'Send reset link'}<b>→</b></button>
            </form>
            <p className="auth-switch"><button type="button" onClick={onLogin}><span>←</span> Back to sign in</button></p>
        </>}
    </AuthShell>
}

export default ForgotPasswordPage
