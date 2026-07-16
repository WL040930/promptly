import React, { useState } from 'react'
import { login } from '../api/auth.js'
import { navigate } from '../utils/router.js'
import AuthShell from './components/AuthShell.jsx'

const LoginPage = ({ onRegister, onLoginSuccess }) => {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState(null)
    const [isSubmitting, setIsSubmitting] = useState(false)

    const handleSubmit = async (e) => {
        e.preventDefault()
        setIsSubmitting(true)
        setError(null)

        try {
            const payload = await login({ email, password })
            if (onLoginSuccess) {
                onLoginSuccess(payload)
            }
        } catch (err) {
            setError(err?.message || 'Login failed. Please try again.')
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <AuthShell
            icon={
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                    <polyline points="10 17 15 12 10 7" />
                    <line x1="15" y1="12" x2="3" y2="12" />
                </svg>
            }
            title="Welcome Back"
            subtitle="Please enter your details to sign in."
        >

                <form onSubmit={handleSubmit} className="flex flex-col gap-6 animate-in fade-in duration-300">
                    <div className="space-y-1.5">
                        <label htmlFor="email" className="block text-sm font-bold text-slate-700">
                            Email Address
                        </label>
                        <input
                            type="email"
                            id="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="name@company.com"
                            className="w-full px-4 py-3 bg-slate-50 hover:bg-white border border-slate-200 hover:border-slate-300 focus:border-indigo-500 focus:bg-white rounded-xl text-slate-900 placeholder:text-slate-400 font-medium outline-none transition-all focus:ring-4 focus:ring-indigo-500/10 shadow-sm"
                            required
                        />
                    </div>

                    <div className="space-y-1.5">
                        <div className="flex justify-between items-center">
                            <label htmlFor="password" className="block text-sm font-bold text-slate-700">
                                Password
                            </label>
                            <button 
                                type="button" 
                                onClick={() => navigate('/forgot-password')}
                                className="text-sm font-bold text-indigo-600 hover:text-indigo-700 hover:underline transition-colors focus:outline-none"
                            >
                                Forgot Password?
                            </button>
                        </div>
                        <input
                            type="password"
                            id="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            className="w-full px-4 py-3 bg-slate-50 hover:bg-white border border-slate-200 hover:border-slate-300 focus:border-indigo-500 focus:bg-white rounded-xl text-slate-900 placeholder:text-slate-400 font-medium outline-none transition-all focus:ring-4 focus:ring-indigo-500/10 shadow-sm"
                            required
                        />
                    </div>

                    {error && (
                        <div className="flex items-start gap-2 text-red-600 bg-red-50 p-3 rounded-lg border border-red-100">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="shrink-0 mt-0.5">
                                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                            </svg>
                            <p className="text-sm font-semibold">{error}</p>
                        </div>
                    )}

                    <button 
                        type="submit" 
                        disabled={isSubmitting || !email.trim() || !password.trim()}
                        className="w-full py-3.5 text-base rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-600/20 transition-all hover:-translate-y-0.5 active:scale-95 disabled:opacity-50 flex justify-center items-center gap-2 mt-2"
                    >
                        {isSubmitting ? (
                            <>
                                <svg className="animate-spin" width="18" height="18" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                Signing In...
                            </>
                        ) : 'Sign In'}
                    </button>
                </form>

                <div className="mt-8 text-center text-sm font-medium text-slate-500">
                    Don't have an account?{' '}
                    <button 
                        type="button" 
                        onClick={onRegister}
                        className="font-bold text-indigo-600 hover:text-indigo-700 hover:underline transition-colors focus:outline-none ml-1"
                    >
                        Sign Up
                    </button>
                </div>
        </AuthShell>
    )
}

export default LoginPage
