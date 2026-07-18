import React from 'react'
import Header from './components/Header'
import Hero from './components/Hero'
import Features from './components/Features'
import HowItWorks from './components/HowItWorks'
import InteractiveDemo from './components/InteractiveDemo'
import Metrics from './components/Metrics'
import CallToAction from './components/CallToAction'
import Footer from './components/Footer'

function LandingPage({ onLogin, onSecurity }) {
  return (
    <div className="min-h-screen bg-white text-slate-900">
      <Header onLogin={onLogin} />
      <main>
        <Hero />

        <div className="py-10 bg-white border-y border-slate-100">
          <div className="max-w-5xl mx-auto px-4 grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
            {[
              ['Describe', 'Start with a plain-language task'],
              ['Review', 'Approve the proposed changes'],
              ['Run', 'Inspect the result and history']
            ].map(([title, description]) => (
              <div key={title} className="rounded-2xl bg-slate-50 border border-slate-100 px-5 py-4">
                <div className="text-sm font-extrabold uppercase tracking-widest text-indigo-600">{title}</div>
                <div className="mt-1 text-sm text-slate-500">{description}</div>
              </div>
            ))}
          </div>
        </div>

        <Features />
        <HowItWorks />
        <InteractiveDemo />
        <Metrics />

        <CallToAction
          title="Ready to Automate Your Admin Future?"
          description="Join dozens of administrative departments that are already redefining productivity with Promptly. Get started in minutes."
          primaryLabel="Start Free Trial"
          onPrimaryClick={onLogin}
        />
      </main>
      <Footer onSecurity={onSecurity} />
    </div>
  )
}

export default LandingPage
