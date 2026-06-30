import React from 'react'

const NAV_OFFSET = 80

function scrollToSection(id) {
  const el = document.getElementById(id)
  if (!el) return
  const y = el.getBoundingClientRect().top + window.scrollY - NAV_OFFSET
  window.scrollTo({ top: y, behavior: 'smooth' })
}

function Header({ onLogin, onSecurity }) {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="Promptly Logo" className="w-8 h-8 object-contain rounded-lg overflow-hidden" />
            <span className="text-2xl font-bold tracking-tight text-indigo-600">Promptly</span>
          </div>
          <nav className="hidden md:flex space-x-8">
            <a
              href="#features"
              onClick={(e) => {
                e.preventDefault()
                scrollToSection('features')
              }}
              className="text-slate-600 hover:text-indigo-600 font-medium transition-colors"
            >
              Features
            </a>
            <a
              href="#how-it-works"
              onClick={(e) => {
                e.preventDefault()
                scrollToSection('how-it-works')
              }}
              className="text-slate-600 hover:text-indigo-600 font-medium transition-colors"
            >
              How it Works
            </a>
            <a
              href="#demo"
              onClick={(e) => {
                e.preventDefault()
                scrollToSection('demo')
              }}
              className="text-slate-600 hover:text-indigo-600 font-medium transition-colors"
            >
              Live Demo
            </a>
          </nav>
          <div className="flex items-center space-x-4">
            <button
              onClick={() => {
                if (onLogin) onLogin()
                else window.location.href = '/login'
              }}
              className="hidden sm:inline-flex text-slate-600 hover:text-indigo-600 font-medium"
            >
              Log in
            </button>
            <button
              onClick={() => scrollToSection('demo')}
              className="bg-indigo-600 text-white px-5 py-2 rounded-full font-medium hover:bg-indigo-700 transition-all shadow-md hover:shadow-lg active:scale-95"
            >
              Get Started
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}

export default Header
