import React, { useRef } from 'react'
import { gsap } from 'gsap'
import { useGSAP } from '@gsap/react'

gsap.registerPlugin(useGSAP)

function Hero() {
  const container = useRef(null)

  useGSAP(() => {
    const tl = gsap.timeline({ defaults: { ease: 'power3.out', duration: 1 } })
    
    tl.from('.hero-badge', { y: -20, opacity: 0 })
      .from('.hero-title', { y: 30, opacity: 0, duration: 1.2 }, '-=0.6')
      .from('.hero-desc', { y: 20, opacity: 0 }, '-=0.8')
      .from('.hero-btn', { y: 20, opacity: 0, stagger: 0.2 }, '-=0.8')
      .from('.hero-image', { y: 40, opacity: 0, duration: 1.5, ease: 'power4.out' }, '-=0.6')
  }, { scope: container })

  return (
    <section ref={container} className="relative pt-32 pb-20 lg:pt-48 lg:pb-32 overflow-hidden">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full -z-10">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-200/40 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-[10%] right-[-10%] w-[40%] h-[40%] bg-teal-200/40 rounded-full blur-[120px]"></div>
      </div>
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <div className="hero-badge inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 text-sm font-medium mb-6">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
          </span>
          <span>Enhance Your Admin Workflow</span>
        </div>
        
        <h1 className="hero-title text-5xl md:text-7xl font-extrabold tracking-tight text-slate-900 mb-8 max-w-4xl mx-auto leading-tight">
          Automate Your Admin Work via <span className="gradient-text">Conversational AI</span>
        </h1>
        
        <p className="hero-desc text-lg md:text-xl text-slate-600 max-w-2xl mx-auto mb-10 leading-relaxed">
          Empower your non-technical staff to use simple conversational prompts to automate complex operations like data entry, email automation, and spreadsheet manipulation.
        </p>
        
        <div className="flex flex-col sm:flex-row justify-center items-center space-y-4 sm:space-y-0 sm:space-x-4">
          <a href="#demo" className="hero-btn w-full sm:w-auto bg-slate-900 text-white px-8 py-4 rounded-xl font-bold text-lg hover:bg-slate-800 transition-all shadow-xl hover:-translate-y-1">
            Try the Agent
          </a>
          <a href="#how-it-works" className="hero-btn w-full sm:w-auto bg-white border border-slate-200 text-slate-900 px-8 py-4 rounded-xl font-bold text-lg hover:bg-slate-50 transition-all shadow-sm">
            See how it works
          </a>
        </div>
        
        <div className="hero-image mt-20 relative max-w-5xl mx-auto">
          <div className="rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden aspect-video relative">
            <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-white to-indigo-50 p-5 sm:p-8 text-left">
              <div className="h-full rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden">
                <div className="h-10 border-b border-slate-100 flex items-center gap-2 px-4">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-300"></span>
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-300"></span>
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-300"></span>
                  <span className="ml-3 text-xs font-semibold text-slate-400">Promptly workspace</span>
                </div>
                <div className="grid grid-cols-[120px_1fr] sm:grid-cols-[180px_1fr] h-[calc(100%-2.5rem)]">
                  <div className="border-r border-slate-100 bg-slate-50 p-3 space-y-2">
                    <div className="h-7 rounded-md bg-indigo-100"></div>
                    <div className="h-7 rounded-md bg-white border border-slate-100"></div>
                    <div className="h-7 rounded-md bg-white border border-slate-100"></div>
                  </div>
                  <div className="p-4 sm:p-6 space-y-4">
                    <div className="h-5 w-2/5 rounded bg-slate-200"></div>
                    <div className="h-20 rounded-lg bg-indigo-50 border border-indigo-100"></div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="h-16 rounded-lg bg-slate-50 border border-slate-100"></div>
                      <div className="h-16 rounded-lg bg-slate-50 border border-slate-100"></div>
                      <div className="h-16 rounded-lg bg-slate-50 border border-slate-100"></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export default Hero
