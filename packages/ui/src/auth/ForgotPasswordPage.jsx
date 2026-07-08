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
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4 font-sans relative overflow-hidden">
            {/* Decorative background blobs */}
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-200/50 rounded-full blur-[100px] pointer-events-none" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-200/50 rounded-full blur-[100px] pointer-events-none" />

            <div className="bg-white/80 backdrop-blur-xl border border-white shadow-2xl rounded-3xl p-8 sm:p-10 max-w-[420px] w-full relative z-10">
                <div className="text-center mb-8">
                    <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-sm border border-indigo-100/50">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <rect width="20" height="16" x="2" y="4" rx="2" />
                            <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                        </svg>
                    </div>
                    <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight mb-2">Forgot Password</h2>
                    <p className="text-slate-500 font-medium">No worries, we'll send you reset instructions.</p>
                </div>

                {message ? (
                    <div className="text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-6 mb-8 text-center">
                            <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M20 6 9 17l-5-5" />
                                </svg>
                            </div>
                            <h3 className="text-emerald-800 font-bold text-lg mb-2">Check your email</h3>
                            <p className="text-emerald-600/90 font-medium text-sm leading-relaxed">
                                If that email address is in our database, we will send you an email to reset your password.
                            </p>
                        </div>
                        <button 
                            onClick={onLogin} 
                            className="w-full py-3.5 text-base rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-600/20 transition-all hover:-translate-y-0.5 active:scale-95"
                        >
                            Return to Sign In
                        </button>
                    </div>
                ) : (
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
                                autoFocus
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
                            disabled={isSubmitting || !email.trim()}
                            className="w-full py-3.5 text-base rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-600/20 transition-all hover:-translate-y-0.5 active:scale-95 disabled:opacity-50 flex justify-center items-center gap-2"
                        >
                            {isSubmitting ? (
                                <>
                                    <svg className="animate-spin" width="18" height="18" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                    Sending...
                                </>
                            ) : 'Send Reset Link'}
                        </button>
                    </form>
                )}

                {!message && (
                    <div className="mt-8 text-center">
                        <button 
                            onClick={onLogin} 
                            className="text-slate-500 hover:text-slate-800 font-semibold text-sm transition-colors flex items-center justify-center gap-1.5 mx-auto group"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="group-hover:-translate-x-1 transition-transform">
                                <path d="m15 18-6-6 6-6"/>
                            </svg>
                            Back to Sign In
                        </button>
                    </div>
                )}
            </div>
        </div>
    )
}

export default ForgotPasswordPage
