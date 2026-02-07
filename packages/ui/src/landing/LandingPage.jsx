import React from 'react'
import Header from './components/Header'
import Hero from './components/Hero'
import Features from './components/Features'
import HowItWorks from './components/HowItWorks'
import InteractiveDemo from './components/InteractiveDemo'
import Metrics from './components/Metrics'
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

function LandingPage({ onLogin }) {
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
                  className="text-xl font-bold text-slate-300 hover:text-blue-500 transition-colors cursor-default select-none uppercase tracking-widest"
                >
                  {brand}
                </span>
              ))}
            </div>
            <div className="flex items-center space-x-16 px-8">
              {BRANDS.map((brand, i) => (
                <span
                  key={`b2-${i}`}
                  className="text-xl font-bold text-slate-300 hover:text-blue-500 transition-colors cursor-default select-none uppercase tracking-widest"
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

        <section className="py-24 bg-blue-600 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2"></div>

          <div className="max-w-4xl mx-auto px-4 text-center relative z-10">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6 leading-tight">Ready to Automate Your Admin Future?</h2>
            <p className="text-xl text-blue-100 mb-10 max-w-2xl mx-auto">
              Join dozens of administrative departments that are already redefining productivity with Promptly. Get started in minutes.
            </p>
            <div className="flex flex-col sm:flex-row justify-center items-center space-y-4 sm:space-y-0 sm:space-x-6">
              <button className="w-full sm:w-auto bg-white text-blue-600 px-10 py-4 rounded-xl font-bold text-lg hover:bg-slate-50 transition-all shadow-2xl hover:scale-105 active:scale-95">
                Start Free Trial
              </button>
              <button className="w-full sm:w-auto bg-blue-700 text-white border border-white/20 px-10 py-4 rounded-xl font-bold text-lg hover:bg-blue-800 transition-all active:scale-95">
                Talk to Sales
              </button>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  )
}

export default LandingPage
