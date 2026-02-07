import React from 'react'

const STEPS = [
  {
    number: '01',
    title: 'Converse',
    description: 'Speak or type your requirement. Promptly understands nuance, jargon, and complex instructions.',
    visual: '🗣️',
    color: 'from-blue-500 to-blue-400'
  },
  {
    number: '02',
    title: 'Analyze',
    description: 'Our AI model decomposes your request into technical steps and required integrations.',
    visual: '🧠',
    color: 'from-indigo-500 to-indigo-400'
  },
  {
    number: '03',
    title: 'Execute',
    description: 'The agent securely connects to your tools (Email, Sheets, CRM) and performs the work.',
    visual: '⚡',
    color: 'from-teal-500 to-teal-400'
  },
  {
    number: '04',
    title: 'Report',
    description: 'Receive a structured summary of what was done and any items requiring human review.',
    visual: '📊',
    color: 'from-rose-500 to-rose-400'
  }
]

function HowItWorks() {
  return (
    <section id="how-it-works" className="py-24 bg-slate-900 text-white overflow-hidden relative scroll-mt-24">
      <div className="absolute top-0 right-0 w-1/3 h-full bg-blue-500/5 blur-[120px] rounded-full pointer-events-none"></div>
      <div className="absolute bottom-0 left-0 w-1/4 h-1/2 bg-indigo-500/5 blur-[100px] rounded-full pointer-events-none"></div>
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="text-center mb-20">
          <h2 className="text-4xl md:text-5xl font-bold mb-6">How it Works</h2>
          <p className="text-xl text-slate-400 max-w-2xl mx-auto">
            From natural language to finished automation in seconds. The technical complexity is hidden behind a simple chat interface.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-y-16 gap-x-12">
          {STEPS.map((step, idx) => (
            <div key={idx} className="relative group flex flex-col items-center text-center">
              {idx < STEPS.length - 1 && (
                <>
                  <div className="hidden lg:block absolute top-10 left-1/2 w-full h-[2px] bg-slate-800 z-0">
                    <div className="h-full bg-blue-500 w-0 group-hover:w-full transition-all duration-700 ease-in-out"></div>
                  </div>
                  {idx % 2 === 0 && (
                    <div className="hidden md:block lg:hidden absolute top-10 left-1/2 w-full h-[2px] bg-slate-800 z-0">
                      <div className="h-full bg-blue-500 w-0 group-hover:w-full transition-all duration-700 ease-in-out"></div>
                    </div>
                  )}
                  <div
                    className={`block ${idx % 2 !== 0 ? 'md:block' : 'md:hidden'} lg:hidden absolute top-10 left-1/2 w-[2px] h-[calc(100%+4rem)] bg-slate-800 z-0`}
                  >
                    <div className="w-full bg-blue-500 h-0 group-hover:h-full transition-all duration-700 ease-in-out"></div>
                  </div>
                </>
              )}
              
              <div className="relative z-10 flex flex-col items-center">
                <div className={`w-20 h-20 rounded-full bg-gradient-to-br ${step.color} flex items-center justify-center text-3xl mb-8 shadow-2xl group-hover:scale-110 transition-transform duration-500 ring-8 ring-slate-900/50`}>
                  {step.visual}
                </div>
                
                <div className="text-blue-500 font-mono font-bold text-sm mb-2 tracking-widest">{step.number}</div>
                <h3 className="text-2xl font-bold mb-4 group-hover:text-blue-400 transition-colors">{step.title}</h3>
                <p className="text-slate-400 leading-relaxed max-w-[250px]">{step.description}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-32 p-1 md:p-12 rounded-[40px] bg-white/5 backdrop-blur-sm border border-white/10 overflow-hidden relative">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-blue-500 to-transparent opacity-50"></div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div className="p-6 md:p-0">
              <h3 className="text-3xl font-bold mb-6">Engineered for Security</h3>
              <p className="text-slate-300 mb-8 text-lg">
                We use an "Agentic Sandbox" approach. Every automation generated is reviewed against safety protocols before execution.
              </p>
              <ul className="space-y-4">
                {[
                  'Enterprise-grade API encryption',
                  'Human-in-the-loop validation for financial tasks',
                  'Comprehensive audit logs for every prompt',
                  'Role-based access control (RBAC)'
                ].map((item, i) => (
                  <li key={item} className="flex items-center text-slate-400 group">
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

            <div className="bg-slate-950/80 rounded-3xl p-6 md:p-8 font-mono text-xs md:text-sm text-blue-300 border border-white/10 shadow-2xl">
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
                <p className="flex items-center animate-pulse"><span className="text-blue-400 mr-3">ACTION:</span> <span className="text-blue-200">Generating Outlook Sandbox Drafts...</span></p>
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
