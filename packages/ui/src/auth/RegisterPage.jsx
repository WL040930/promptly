import React, { useState } from 'react'
import { register } from '../api/auth.js'
import AuthShell from './components/AuthShell.jsx'

const RegisterPage = ({ onLogin, onLoginSuccess }) => {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [error, setError] = useState(null)
    const [isSubmitting, setIsSubmitting] = useState(false)

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (password !== confirmPassword) {
            setError('Passwords do not match')
            return
        }

        setIsSubmitting(true)
        setError(null)

        try {
            const payload = await register({ email, password })
            if (onLoginSuccess) {
                onLoginSuccess(payload)
            } else if (onLogin) {
                onLogin()
            }
        } catch (err) {
            setError(err?.message || 'Registration failed. Please try again.')
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <AuthShell
            icon={
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <line x1="19" y1="8" x2="19" y2="14" />
                    <line x1="22" y1="11" x2="16" y2="11" />
                </svg>
            }
            title="Create Account"
            subtitle="Please enter your details to sign up."
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
                        <label htmlFor="password" className="block text-sm font-bold text-slate-700">
                            Password
                        </label>
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

                    <div className="space-y-1.5">
                        <label htmlFor="confirmPassword" className="block text-sm font-bold text-slate-700">
                            Confirm Password
                        </label>
                        <input
                            type="password"
                            id="confirmPassword"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="••••••••"
                            className={`w-full px-4 py-3 bg-slate-50 hover:bg-white border ${error && error.includes('match') ? 'border-red-400 focus:border-red-500 focus:ring-red-500/10' : 'border-slate-200 hover:border-slate-300 focus:border-indigo-500 focus:ring-indigo-500/10'} focus:bg-white rounded-xl text-slate-900 placeholder:text-slate-400 font-medium outline-none transition-all focus:ring-4 shadow-sm`}
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
                        disabled={isSubmitting || !email.trim() || !password.trim() || !confirmPassword.trim()}
                        className="w-full py-3.5 text-base rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-600/20 transition-all hover:-translate-y-0.5 active:scale-95 disabled:opacity-50 flex justify-center items-center gap-2 mt-2"
                    >
                        {isSubmitting ? (
                            <>
                                <svg className="animate-spin" width="18" height="18" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                Signing Up...
                            </>
                        ) : 'Sign Up'}
                    </button>
                </form>

                <div className="mt-8 text-center text-sm font-medium text-slate-500">
                    Already have an account?{' '}
                    <button 
                        type="button" 
                        onClick={onLogin}
                        className="font-bold text-indigo-600 hover:text-indigo-700 hover:underline transition-colors focus:outline-none ml-1"
                    >
                        Sign In
                    </button>
                </div>
        </AuthShell>
    )
}

export default RegisterPage
