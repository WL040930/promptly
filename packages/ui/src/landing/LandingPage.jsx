import React from 'react'
import Header from './components/Header'
import Hero from './components/Hero'
import Features from './components/Features'
import HowItWorks from './components/HowItWorks'
import InteractiveDemo from './components/InteractiveDemo'
import Metrics from './components/Metrics'
import CallToAction from './components/CallToAction'
import Footer from './components/Footer'

const BRANDS = [
  'AdminX',
  'WorkflowPro',
  'TaskMaster',
  'EfficiencyAI',
  'CorpSolutions',
  'StaffSync',
  'LogiAdmin',
  'ProcessFlow',
  'AutomateHQ',
  'SyncSystems'
]

function LandingPage({ onLogin, onSecurity }) {
  return (
    <div className="min-h-screen bg-white text-slate-900">
      <Header onLogin={onLogin} />
      <main>
        <Hero />

        <div className="py-12 bg-white border-y border-slate-100 overflow-hidden relative">
          <div className="edge-fade-left z-10"></div>
          <div className="edge-fade-right z-10"></div>

          <div className="animate-marquee-right whitespace-nowrap flex">
            <div className="flex items-center space-x-16 px-8">
              {BRANDS.map((brand, i) => (
                <span
                  key={`b1-${i}`}
                  className="text-xl font-bold text-slate-300 hover:text-indigo-500 transition-colors cursor-default select-none uppercase tracking-widest"
                >
                  {brand}
                </span>
              ))}
            </div>
            <div className="flex items-center space-x-16 px-8">
              {BRANDS.map((brand, i) => (
                <span
                  key={`b2-${i}`}
                  className="text-xl font-bold text-slate-300 hover:text-indigo-500 transition-colors cursor-default select-none uppercase tracking-widest"
                >
                  {brand}
                </span>
              ))}
            </div>
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
          secondaryLabel="Talk to Sales"
        />
      </main>
      <Footer onSecurity={onSecurity} />
    </div>
  )
}

export default LandingPage
