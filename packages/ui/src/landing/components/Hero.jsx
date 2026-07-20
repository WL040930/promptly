import { useRef } from 'react'
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
    <section ref={container} className="surface-grid relative overflow-hidden pb-20 pt-32 lg:pb-28 lg:pt-44">
      <div className="pointer-events-none absolute -right-24 top-24 h-80 w-80 rounded-full bg-[#bdb7ff]/35 blur-[110px]" />
      <div className="pointer-events-none absolute -left-24 bottom-0 h-72 w-72 rounded-full bg-[#c8f17b]/20 blur-[110px]" />

      <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-4 sm:px-6 lg:grid-cols-[0.92fr_1.08fr] lg:gap-20 lg:px-8">
        <div className="text-left">
          <div className="hero-badge landing-kicker mb-7">The calm way to automate operations</div>
          <h1 className="hero-title max-w-2xl font-display text-5xl font-bold leading-[1.02] tracking-[-0.055em] text-[#171827] md:text-7xl">
            Turn a sentence into <span className="gradient-text">work that runs.</span>
          </h1>
          <p className="hero-desc mt-7 max-w-xl text-lg leading-8 text-slate-600 md:text-xl">
            Promptly helps teams describe an outcome, review the proposed steps, and keep every automation visible after it ships.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <a href="#demo" className="hero-btn inline-flex items-center justify-center rounded-xl bg-[#171827] px-6 py-3.5 text-base font-bold text-white shadow-[0_12px_24px_rgba(23,24,39,0.18)] transition-all hover:-translate-y-1 hover:bg-[#252438]">
              Try the agent <span className="ml-2 text-[#c8f17b]">↗</span>
            </a>
            <a href="#how-it-works" className="hero-btn inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white/70 px-6 py-3.5 text-base font-bold text-[#171827] transition-all hover:-translate-y-1 hover:border-[#aaa2ff] hover:bg-white">
              See how it works
            </a>
          </div>
          <div className="hero-desc mt-9 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-semibold text-slate-500">
            <span className="inline-flex items-center gap-2"><span className="status-dot" />Human review built in</span>
            <span>Per-workspace history</span>
            <span>Start free</span>
          </div>
        </div>

        <div className="hero-image relative lg:pt-6">
          <div className="absolute -right-5 -top-1 z-10 rounded-2xl border border-white/80 bg-[#171827] px-4 py-3 text-left text-white shadow-xl shadow-[#171827]/20 sm:right-2">
            <div className="flex items-center gap-2 text-xs font-bold"><span className="status-dot" />Agent ready</div>
            <p className="mt-1 text-[10px] text-slate-400">No changes applied yet</p>
          </div>
          <div className="relative overflow-hidden rounded-[2rem] border border-white bg-white p-2 shadow-[0_28px_70px_rgba(23,24,39,0.16)]">
            <div className="overflow-hidden rounded-[1.5rem] border border-slate-200 bg-[#f7f7fb]">
              <div className="flex h-11 items-center justify-between border-b border-slate-200 bg-white px-4 text-left">
                <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-[#ff8d8d]" /><span className="h-2.5 w-2.5 rounded-full bg-[#ffd166]" /><span className="h-2.5 w-2.5 rounded-full bg-[#c8f17b]" /></div>
                <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Promptly / Assistant</span>
                <span className="status-dot" />
              </div>
              <div className="grid min-h-[320px] grid-cols-[108px_1fr] sm:grid-cols-[156px_1fr]">
                <div className="border-r border-slate-200 bg-[#171827] p-3 text-left">
                  <div className="mb-6 flex items-center gap-2"><img src="/logo.png" alt="" className="h-5 w-5 rounded-md" /><span className="font-display text-xs font-bold text-white">Promptly</span></div>
                  <div className="space-y-2 text-[9px] font-semibold"><div className="rounded-lg bg-white px-2 py-2 text-[#5143cc]">Home</div><div className="rounded-lg px-2 py-2 text-slate-400">Automations</div><div className="rounded-lg px-2 py-2 text-slate-400">Forms</div><div className="rounded-lg px-2 py-2 text-slate-400">Runs</div></div>
                </div>
                <div className="p-4 text-left sm:p-7">
                  <div className="flex items-start justify-between gap-3"><div><p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#5b4ee8]">Workspace overview</p><p className="mt-1 font-display text-lg font-bold text-[#171827] sm:text-2xl">Make work move forward.</p></div><span className="rounded-lg bg-[#f1efff] px-2 py-1 text-[9px] font-bold text-[#5143cc]">Healthy</span></div>
                  <div className="mt-5 rounded-2xl border border-[#d9d5ff] bg-[#f1efff] p-4"><div className="flex items-center gap-2 text-[10px] font-bold text-[#5143cc]"><span className="status-dot" />What should happen next?</div><p className="mt-2 text-xs leading-5 text-slate-600">“When a request arrives, summarize it and notify the team.”</p></div>
                  <div className="mt-4 grid grid-cols-3 gap-2"><div className="rounded-xl border border-slate-200 bg-white p-3"><p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Active</p><p className="mt-2 font-display text-lg font-bold text-[#171827]">08</p></div><div className="rounded-xl border border-slate-200 bg-white p-3"><p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Runs</p><p className="mt-2 font-display text-lg font-bold text-[#171827]">124</p></div><div className="rounded-xl border border-slate-200 bg-white p-3"><p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Success</p><p className="mt-2 font-display text-lg font-bold text-[#171827]">98%</p></div></div>
                  <div className="mt-4 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5"><span className="status-dot" /><span className="text-[10px] font-semibold text-slate-600">All active automations are running normally</span></div>
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
