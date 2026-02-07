import React, { useState } from 'react'

function LoginPage({ onBack }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    setError('')
    setMessage('')

    if (!email.trim() || !password.trim()) {
      setError('Please enter both email and password.')
      return
    }

    setMessage('Submitted! Replace this with your auth call.')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 text-white flex">
      <div className="hidden lg:flex flex-1 items-center justify-center p-12">
        <div className="max-w-xl w-full glass-card bg-white/5 border-white/10 rounded-3xl p-10 shadow-2xl">
          <p className="text-sm uppercase tracking-[0.3em] text-blue-300 mb-4">Promptly</p>
          <h1 className="text-4xl font-bold mb-4 leading-tight">Welcome back</h1>
          <p className="text-slate-300 text-lg leading-relaxed">
            Sign in to access your admin automations, workflows, and analytics. Your credentials are encrypted in transit.
          </p>
          <div className="mt-10 grid grid-cols-2 gap-4 text-sm text-slate-200">
            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
              <p className="text-3xl font-bold text-blue-300">24/7</p>
              <p className="text-slate-400">Secure access</p>
            </div>
            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
              <p className="text-3xl font-bold text-emerald-300">SSO</p>
              <p className="text-slate-400">Ready when enabled</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md bg-white text-slate-900 rounded-3xl shadow-2xl border border-slate-200 p-8 sm:p-10">
          <div className="flex items-center justify-between mb-8">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">Promptly Console</p>
              <h2 className="text-2xl font-bold mt-2">Log in</h2>
            </div>
            <button
              type="button"
              onClick={onBack}
              className="text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              ← Back
            </button>
          </div>

          <form className="space-y-6" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm shadow-sm focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none"
                placeholder="you@example.com"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm shadow-sm focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none"
                placeholder="••••••••"
                required
              />
            </div>

            <div className="flex items-center justify-between text-sm">
              <label className="inline-flex items-center space-x-2 text-slate-600">
                <input type="checkbox" className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                <span>Remember me</span>
              </label>
              <a href="#" className="text-blue-600 hover:text-blue-700 font-semibold">
                Forgot password?
              </a>
            </div>

            {error && <div className="text-sm text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-4 py-3">{error}</div>}
            {message && <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">{message}</div>}

            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl shadow-lg shadow-blue-500/30 transition-transform active:scale-95"
            >
              Continue
            </button>
          </form>

          <p className="text-xs text-slate-500 mt-6">
            By continuing, you agree to our Terms and acknowledge our Privacy Policy.
          </p>
        </div>
      </div>
    </div>
  )
}

export default LoginPage
