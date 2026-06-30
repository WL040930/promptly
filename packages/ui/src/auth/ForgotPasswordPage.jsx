import React, { useState } from 'react'
import { forgotPassword } from '../api/auth.js'

const ForgotPasswordPage = ({ onBack, onLogin }) => {
    const [email, setEmail] = useState('')
    const [message, setMessage] = useState(null)
    const [error, setError] = useState(null)
    const [isSubmitting, setIsSubmitting] = useState(false)

    const handleSubmit = async (e) => {
        e.preventDefault()
        setIsSubmitting(true)
        setError(null)
        setMessage(null)

        try {
            const response = await forgotPassword(email)
            setMessage(response.message || 'Password reset link sent to your email.')
        } catch (err) {
            setError(err?.message || 'Failed to send reset link. Please try again.')
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(135deg, #f7f9fc 0%, #eef2f7 100%)',
            padding: '1rem'
        }}>
            <div className="glass-card" style={{
                width: '100%',
                maxWidth: '420px',
                padding: '2.5rem',
                borderRadius: '24px',
                boxShadow: '0 20px 40px rgba(15, 23, 42, 0.05)'
            }}>
                <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
                    <h2 style={{ fontSize: '2rem', fontWeight: '800', marginBottom: '0.75rem', letterSpacing: '-0.02em' }}>Forgot Password</h2>
                    <p className="muted" style={{ fontSize: '1.05rem' }}>Enter your email to receive a reset link.</p>
                </div>

                {message ? (
                    <div style={{ textAlign: 'center' }}>
                        <p style={{ color: '#10b981', fontSize: '1.05rem', fontWeight: '600', marginBottom: '2rem' }}>
                            {message}
                        </p>
                        <button onClick={onLogin} className="solid full" style={{
                            padding: '1rem',
                            fontSize: '1.05rem',
                            borderRadius: '12px',
                        }}>
                            Return to Sign In
                        </button>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '1.75rem' }}>
                        <div>
                            <label htmlFor="email" style={{ display: 'block', marginBottom: '0.6rem', fontWeight: '700', fontSize: '0.9rem', color: '#334155' }}>
                                Email
                            </label>
                            <input
                                type="email"
                                id="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="name@company.com"
                                style={{
                                    width: '100%',
                                    padding: '0.85rem 1rem',
                                    borderRadius: '12px',
                                    border: '1px solid #e2e8f0',
                                    background: '#ffffff',
                                    fontSize: '1rem',
                                    fontWeight: '500',
                                    outline: 'none',
                                    transition: 'all 0.2s ease',
                                    boxShadow: '0 2px 5px rgba(0,0,0,0.02)'
                                }}
                                onFocus={(e) => {
                                    e.target.style.borderColor = '#3b82f6'
                                    e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                                }}
                                onBlur={(e) => {
                                    e.target.style.borderColor = '#e2e8f0'
                                    e.target.style.boxShadow = '0 2px 5px rgba(0,0,0,0.02)'
                                }}
                                required
                            />
                        </div>

                        {error && (
                            <p style={{ color: '#ef4444', fontSize: '0.9rem', marginTop: '-0.5rem', fontWeight: '600' }}>
                                {error}
                            </p>
                        )}

                        <button type="submit" className="solid full" style={{
                            padding: '1rem',
                            fontSize: '1.05rem',
                            borderRadius: '12px',
                            marginTop: '0.5rem',
                            opacity: isSubmitting ? 0.7 : 1
                        }} disabled={isSubmitting}>
                            {isSubmitting ? 'Sending...' : 'Send Reset Link'}
                        </button>
                    </form>
                )}

                <div style={{ marginTop: '2rem', textAlign: 'center' }}>
                    <button onClick={onLogin} className="ghost full" style={{
                        padding: '0.75rem',
                        borderRadius: '12px',
                        color: '#64748b',
                        borderColor: 'transparent',
                        background: 'transparent'
                    }}>
                        Back to Sign In
                    </button>
                </div>
            </div>
        </div>
    )
}

export default ForgotPasswordPage
