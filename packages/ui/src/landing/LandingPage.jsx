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
    <div className="min-h-screen bg-[#f8f8fc] text-[#171827]">
      <Header onLogin={onLogin} />
      <main>
        <Hero />

        <div className="border-y border-slate-200/80 bg-white py-8">
          <div className="mx-auto grid max-w-5xl grid-cols-1 gap-3 px-4 text-left sm:grid-cols-3">
            {[
              ['Describe', 'Start with a plain-language task'],
              ['Review', 'Approve the proposed changes'],
              ['Run', 'Inspect the result and history']
            ].map(([title, description]) => (
              <div key={title} className="rounded-2xl border border-slate-200 bg-[#f8f8fc] px-5 py-4">
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#5b4ee8]">{title}</div>
                <div className="mt-1 text-sm text-slate-600">{description}</div>
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
