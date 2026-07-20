import { useRef } from 'react'
import { gsap } from 'gsap'
import { useGSAP } from '@gsap/react'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(useGSAP, ScrollTrigger)

const STEPS = [
  {
    number: '01',
    title: 'Converse',
    description: 'Type the result you want. Promptly turns the request into a reviewable automation proposal.',
    visual: '🗣️',
    color: 'from-indigo-500 to-indigo-400'
  },
  {
    number: '02',
    title: 'Analyze',
    description: 'The AI layer maps the request to available triggers, steps, and supported actions.',
    visual: '🧠',
    color: 'from-indigo-500 to-indigo-400'
  },
  {
    number: '03',
    title: 'Execute',
    description: 'Run the automation through supported actions such as email, Google Sheets, database, or HTTP.',
    visual: '⚡',
    color: 'from-teal-500 to-teal-400'
  },
  {
    number: '04',
    title: 'Report',
    description: 'Inspect the run result, step details, and any failure that needs attention.',
    visual: '📊',
    color: 'from-rose-500 to-rose-400'
  }
]

function HowItWorks() {
  const container = useRef(null)

  useGSAP(() => {
    gsap.from('.how-step', {
      scrollTrigger: {
        trigger: '.how-steps-container',
        start: 'top 80%',
        toggleActions: 'play none none none'
      },
      y: 40,
      opacity: 0,
      duration: 0.8,
      stagger: 0.2,
      ease: 'power3.out'
    })

    gsap.from('.how-feature', {
      scrollTrigger: {
        trigger: '.how-features-container',
        start: 'top 85%',
        toggleActions: 'play none none none'
      },
      x: -30,
      opacity: 0,
      duration: 0.6,
      stagger: 0.1,
      ease: 'power2.out'
    })
  }, { scope: container })

  return (
    <section ref={container} id="how-it-works" className="landing-ink-panel relative scroll-mt-24 overflow-hidden py-24 text-white">
      <div className="absolute top-0 right-0 w-1/3 h-full bg-indigo-500/5 blur-[120px] rounded-full pointer-events-none"></div>
      <div className="absolute bottom-0 left-0 w-1/4 h-1/2 bg-indigo-500/5 blur-[100px] rounded-full pointer-events-none"></div>
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="mb-20 max-w-3xl">
          <p className="mb-6 text-xs font-bold uppercase tracking-[0.2em] text-[#c8f17b]">A visible lifecycle</p>
          <h2 className="mb-6 font-display text-4xl font-bold tracking-[-0.04em] md:text-5xl">From intent to a run you can trust.</h2>
          <p className="max-w-2xl text-lg leading-8 text-slate-400">
            From natural language to finished automation in seconds. The technical complexity is hidden behind a simple chat interface.
          </p>
        </div>

        <div className="how-steps-container grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-y-16 gap-x-12">
          {STEPS.map((step, idx) => (
            <div key={idx} className="how-step relative group flex flex-col items-center text-center">
              {idx < STEPS.length - 1 && (
                <>
                  <div className="hidden lg:block absolute top-10 left-1/2 w-full h-[2px] bg-slate-800 z-0">
                    <div className="h-full bg-indigo-500 w-0 group-hover:w-full transition-all duration-700 ease-in-out"></div>
                  </div>
                  {idx % 2 === 0 && (
                    <div className="hidden md:block lg:hidden absolute top-10 left-1/2 w-full h-[2px] bg-slate-800 z-0">
                      <div className="h-full bg-indigo-500 w-0 group-hover:w-full transition-all duration-700 ease-in-out"></div>
                    </div>
                  )}
                  <div
                    className={`block ${idx % 2 !== 0 ? 'md:block' : 'md:hidden'} lg:hidden absolute top-10 left-1/2 w-[2px] h-[calc(100%+4rem)] bg-slate-800 z-0`}
                  >
                    <div className="w-full bg-indigo-500 h-0 group-hover:h-full transition-all duration-700 ease-in-out"></div>
                  </div>
                </>
              )}
              
              <div className="relative z-10 flex flex-col items-center">
                <div className={`flex h-20 w-20 items-center justify-center rounded-[1.5rem] bg-gradient-to-br ${step.color} mb-8 text-3xl shadow-2xl shadow-indigo-950/30 transition-transform duration-500 ring-8 ring-[#171827]/50 group-hover:scale-110`}>
                  <span aria-hidden="true">{step.visual}</span>
                </div>
                
                <div className="mb-2 font-mono text-sm font-bold tracking-widest text-[#c8f17b]">{step.number}</div>
                <h3 className="mb-4 font-display text-2xl font-bold transition-colors group-hover:text-[#c8f17b]">{step.title}</h3>
                <p className="max-w-[250px] leading-relaxed text-slate-400">{step.description}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="relative mt-32 overflow-hidden rounded-[2rem] border border-white/10 bg-white/5 p-1 backdrop-blur-sm md:p-12">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-indigo-500 to-transparent opacity-50"></div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div className="p-6 md:p-0">
              <h3 className="text-3xl font-bold mb-6">Engineered for Security</h3>
              <p className="text-slate-300 mb-8 text-lg">
                We use an "Agentic Sandbox" approach. Every automation generated is reviewed against safety protocols before execution.
              </p>
              <ul className="how-features-container space-y-4">
                {[
                  'Authenticated API requests',
                  'Review before applying AI proposals',
                  'Execution history for workflow runs',
                  'Per-user resource scoping'
                ].map((item, i) => (
                  <li key={item} className="how-feature flex items-center text-slate-400 group">
                    <div className="w-8 h-8 rounded-lg bg-teal-500/10 flex items-center justify-center mr-4 group-hover:bg-teal-500/20 transition-colors">
                      <svg className="w-5 h-5 text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-slate-950/80 rounded-3xl p-6 md:p-8 font-mono text-xs md:text-sm text-indigo-300 border border-white/10 shadow-2xl">
              <div className="flex items-center space-x-2 mb-6 border-b border-white/5 pb-4">
                <div className="flex space-x-1.5">
                  <div className="w-3 h-3 rounded-full bg-rose-500/80"></div>
                  <div className="w-3 h-3 rounded-full bg-amber-500/80"></div>
                  <div className="w-3 h-3 rounded-full bg-emerald-500/80"></div>
                </div>
                <span className="ml-4 text-slate-500 text-[10px] uppercase tracking-widest font-bold">engine_runtime.log</span>
              </div>
              <div className="space-y-3">
                <p className="flex items-start"><span className="text-teal-400 mr-3">PROMPT:</span> <span className="text-slate-200">"Draft follow-up emails for all pending invoices"</span></p>
                <p className="flex items-start"><span className="text-indigo-400 mr-3">ANALYSIS:</span> <span className="text-slate-400">Request categorized as [OUTREACH_AUTOMATION]</span></p>
                <div className="pl-4 border-l-2 border-slate-800 space-y-2 py-1">
                  <p className="text-slate-500">1. Authenticating FinanceSheet API...</p>
                  <p className="text-slate-500">2. Querying rows where [Status] == "Pending"</p>
                  <p className="text-slate-500">3. Sanitizing 14 records for PII safety...</p>
                </div>
                <p className="flex items-center animate-pulse"><span className="text-indigo-400 mr-3">ACTION:</span> <span className="text-indigo-200">Generating Outlook Sandbox Drafts...</span></p>
                <div className="mt-4 pt-4 border-t border-white/5">
                  <p className="text-emerald-400 font-bold flex items-center">
                    <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                    WORKFLOW READY FOR HUMAN APPROVAL
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export default HowItWorks
