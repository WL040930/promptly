import React, { useState } from 'react'

const LoginPage = ({ onBack }) => {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')

    const handleSubmit = (e) => {
        e.preventDefault()
        // TODO: Implement actual login logic
        console.log('Login attempt:', { email, password })
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
                    <h2 style={{ fontSize: '2rem', fontWeight: '800', marginBottom: '0.75rem', letterSpacing: '-0.02em' }}>Welcome Back</h2>
                    <p className="muted" style={{ fontSize: '1.05rem' }}>Please enter your details to sign in.</p>
                </div>

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

                    <div>
                        <label htmlFor="password" style={{ display: 'block', marginBottom: '0.6rem', fontWeight: '700', fontSize: '0.9rem', color: '#334155' }}>
                            Password
                        </label>
                        <input
                            type="password"
                            id="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
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

                    <button type="submit" className="solid full" style={{
                        padding: '1rem',
                        fontSize: '1.05rem',
                        borderRadius: '12px',
                        marginTop: '0.5rem'
                    }}>
                        Sign In
                    </button>
                </form>

                <div style={{ marginTop: '2rem', textAlign: 'center' }}>
                    <button onClick={onBack} className="ghost full" style={{
                        padding: '0.75rem',
                        borderRadius: '12px',
                        color: '#64748b',
                        borderColor: 'transparent',
                        background: 'transparent'
                    }}>
                        Back to Home
                    </button>
                </div>
            </div>
        </div>
    )
}

export default LoginPage
