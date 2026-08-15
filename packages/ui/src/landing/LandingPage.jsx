import { useEffect, useRef, useState } from 'react'
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  CircleCheck,
  Clock3,
  Command,
  Inbox,
  Layers3,
  LockKeyhole,
  Mail,
  Menu,
  MessageSquareText,
  Play,
  ShieldCheck,
  Sparkles,
  Workflow,
  X
} from 'lucide-react'

const SCENES = [
  {
    id: 'intent',
    label: 'Intent',
    eyebrow: '01 / Describe the outcome',
    title: 'Start with the sentence in your head.',
    body: 'Tell Promptly what should happen. It keeps the human context that rigid builders throw away.',
    accent: '#a99dff',
    type: 'intent',
    tags: ['Plain language', 'Context-aware']
  },
  {
    id: 'shape',
    label: 'Shape',
    eyebrow: '02 / Shape the logic',
    title: 'Watch the moving parts take their place.',
    body: 'The agent translates intent into a reviewable workflow with clear nodes, values, and handoffs.',
    accent: '#7c6cff',
    type: 'shape',
    tags: ['Visual graph', 'Editable steps']
  },
  {
    id: 'review',
    label: 'Review',
    eyebrow: '03 / Keep the decision yours',
    title: 'Nothing ships behind your back.',
    body: 'Review proposed changes, ask for a refinement, then approve the exact version you want to run.',
    accent: '#c7bdff',
    type: 'review',
    tags: ['Human approval', 'Safe changes']
  },
  {
    id: 'run',
    label: 'Run',
    eyebrow: '04 / Make work move',
    title: 'Every run leaves a trail you can trust.',
    body: 'Launch the workflow and see what happened, where, and why — without hunting through logs.',
    accent: '#b9ff65',
    type: 'run',
    tags: ['Live history', 'Clear ownership'],
    final: true
  }
]

const CAPABILITIES = [
  {
    icon: MessageSquareText,
    number: '01',
    title: 'Conversational setup',
    copy: 'Describe an outcome in the language your team already uses. Promptly keeps the nuance and finds the structure.'
  },
  {
    icon: Workflow,
    number: '02',
    title: 'A workflow you can see',
    copy: 'Inspect every trigger, action, branch, and value before it changes anything in your workspace.'
  },
  {
    icon: ShieldCheck,
    number: '03',
    title: 'Control at the edge',
    copy: 'Approval gates, scoped resources, and an execution history make automation easier to trust.'
  }
]

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value))
}

function SceneVisual({ type }) {
  if (type === 'intent') {
    return (
      <div className="scene-visual scene-visual-intent">
        <div className="scene-orbit scene-orbit-one" />
        <div className="scene-orbit scene-orbit-two" />
        <div className="intent-window">
          <div className="intent-window-bar"><span /><span /><span /><small>ask promptly</small></div>
          <div className="intent-message intent-message-soft">I need a clean way to follow up on new applications.</div>
          <div className="intent-message intent-message-main">When someone submits the form, ask me to approve it. If I approve, invite them for an interview next week.</div>
          <div className="intent-cursor"><span />Promptly is listening</div>
        </div>
        <div className="floating-chip floating-chip-top"><Sparkles size={12} /> understands context</div>
        <div className="floating-chip floating-chip-bottom"><span className="pulse-dot" /> draft, not deployed</div>
      </div>
    )
  }

  if (type === 'shape') {
    return (
      <div className="scene-visual scene-visual-shape">
        <div className="graph-rail graph-rail-one" />
        <div className="graph-rail graph-rail-two" />
        <div className="graph-rail graph-rail-three" />
        <div className="flow-node flow-node-trigger"><Inbox size={15} /><span>Form submitted</span><small>trigger</small></div>
        <div className="flow-node flow-node-approve"><CircleCheck size={15} /><span>Review request</span><small>approval gate</small></div>
        <div className="flow-node flow-node-email"><Mail size={15} /><span>Send invitation</span><small>email action</small></div>
        <div className="flow-node flow-node-branch"><Layers3 size={15} /><span>Otherwise</span><small>branch</small></div>
        <div className="shape-caption"><span className="pulse-dot" /> mapping intent to nodes</div>
      </div>
    )
  }

  if (type === 'review') {
    return (
      <div className="scene-visual scene-visual-review">
        <div className="review-backdrop-card" />
        <div className="review-sheet">
          <div className="review-sheet-top"><div><span className="tiny-label">PROPOSAL / 04</span><h4>Candidate follow-up</h4></div><span className="review-status">Ready for review</span></div>
          <div className="review-summary"><div className="review-avatar">JL</div><div><strong>Job application received</strong><span>3 workflow changes prepared</span></div><ChevronRight size={16} /></div>
          <div className="review-list">
            <div><Check size={13} /> <span>Use applicant email from required field</span></div>
            <div><Check size={13} /> <span>Pause for your approval</span></div>
            <div><Check size={13} /> <span>Send a personal next-step message</span></div>
          </div>
          <div className="review-actions"><button type="button" className="review-button review-button-ghost">Edit proposal</button><button type="button" className="review-button review-button-primary">Approve changes <ArrowUpRight size={13} /></button></div>
        </div>
        <div className="floating-chip floating-chip-review"><LockKeyhole size={12} /> human in the loop</div>
      </div>
    )
  }

  return (
    <div className="scene-visual scene-visual-run">
      <div className="run-sun" />
      <div className="run-board">
        <div className="run-board-top"><div><span className="tiny-label">LIVE AUTOMATION</span><h4>Candidate follow-up</h4></div><span className="live-pill"><span className="pulse-dot" /> Running</span></div>
        <div className="run-metrics"><div><span>Runs this week</span><strong>128</strong><small>+18.4%</small></div><div><span>Success rate</span><strong>98.6%</strong><small>steady</small></div><div><span>Time returned</span><strong>14h</strong><small>to your team</small></div></div>
        <div className="run-chart"><span className="chart-line chart-line-back" /><span className="chart-line chart-line-front" /><div className="chart-labels"><span>Mon</span><span>Wed</span><span>Fri</span><span>Now</span></div></div>
        <div className="run-event"><span className="event-icon"><Mail size={13} /></span><div><strong>Interview invitation sent</strong><span>Jordan Lee · just now</span></div><CircleCheck size={16} className="run-check" /></div>
      </div>
      <div className="run-particle run-particle-one" /><div className="run-particle run-particle-two" /><div className="run-particle run-particle-three" />
    </div>
  )
}

function ScrollWorld() {
  const rootRef = useRef(null)
  const [progress, setProgress] = useState(0)
  const [activeIndex, setActiveIndex] = useState(0)

  useEffect(() => {
    let raf = 0
    const read = () => {
      raf = 0
      const root = rootRef.current
      if (!root) return
      const rect = root.getBoundingClientRect()
      const max = Math.max(1, rect.height - window.innerHeight)
      const next = clamp(-rect.top / max)
      setProgress(next)
      setActiveIndex(Math.min(SCENES.length - 1, Math.floor(next * SCENES.length)))
    }
    const onScroll = () => { if (!raf) raf = window.requestAnimationFrame(read) }
    read()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      if (raf) window.cancelAnimationFrame(raf)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [])

  const jumpTo = (index) => {
    const root = rootRef.current
    if (!root) return
    const max = root.offsetHeight - window.innerHeight
    window.scrollTo({ top: root.offsetTop + max * ((index + 0.42) / SCENES.length), behavior: 'smooth' })
  }

  return (
    <section ref={rootRef} id="journey" className="scroll-world" style={{ '--world-progress': progress }}>
      <div className="scroll-world-sticky">
        <div className="world-noise" />
        <div className="world-glow world-glow-left" />
        <div className="world-glow world-glow-right" />
        <div className="world-grid" style={{ transform: `translate3d(${(progress - 0.5) * -4}%, ${(progress - 0.5) * 2}%, 0) rotateX(58deg) rotateZ(-8deg)` }} />

        <div className="world-topline">
          <span className="world-kicker"><span className="pulse-dot" /> scroll to fly through a workflow</span>
          <span className="world-counter">0{activeIndex + 1} <i /> 0{SCENES.length}</span>
        </div>

        <div className="world-stage" aria-live="polite">
          {SCENES.map((scene, index) => {
            const sceneProgress = clamp(progress * SCENES.length - index)
            const distance = index - progress * (SCENES.length - 1)
            const active = index === activeIndex
            return (
              <div
                key={scene.id}
                className={`world-scene ${active ? 'is-active' : ''}`}
                style={{
                  '--scene-accent': scene.accent,
                  opacity: active ? 1 : clamp(1 - Math.abs(distance) * 1.4, 0, 0.32),
                  transform: `translate3d(${distance * 7}%, ${Math.abs(distance) * 5}%, 0) scale(${1 - Math.min(0.14, Math.abs(distance) * 0.08)}) rotate(${distance * 1.2}deg)`
                }}
              >
                <div className="scene-aura" />
                <SceneVisual type={scene.type} />
                <div className="scene-floor-shadow" />
                <span className="scene-name">{scene.label}</span>
                <span className="scene-index">0{index + 1}</span>
                <span className="scene-progress" style={{ transform: `scaleX(${sceneProgress})` }} />
              </div>
            )
          })}
        </div>

        <div className="world-copy-wrap">
          {SCENES.map((scene, index) => {
            const local = clamp(progress * SCENES.length - index)
            const isVisible = Math.abs(local - 0.5) < 0.72 || (index === 0 && progress < 0.2) || (index === SCENES.length - 1 && progress > 0.78)
            const copyOpacity = index === 0
              ? (local <= 0.5 ? 1 : clamp(1 - (local - 0.5) * 2.2, 0, 1))
              : index === SCENES.length - 1
                ? (local >= 0.5 ? 1 : clamp(local * 2.2, 0, 1))
                : clamp(1 - Math.abs(local - 0.5) * 2.2, 0, 1)
            return (
              <article key={scene.id} className={`world-copy ${isVisible ? 'is-visible' : ''}`} style={{ '--copy-opacity': isVisible ? copyOpacity : 0, '--copy-y': `${(0.5 - local) * 22}px` }}>
                <span className="world-copy-eyebrow" style={{ color: scene.accent }}>{scene.eyebrow}</span>
                <h2>{scene.title}</h2>
                <p>{scene.body}</p>
                <div className="world-tags">{scene.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
                {scene.final && <a href="#start" className="world-copy-cta">Build your first workflow <ArrowUpRight size={15} /></a>}
              </article>
            )
          })}
        </div>

        <div className="world-route" aria-label="Workflow journey">
          {SCENES.map((scene, index) => <button key={scene.id} type="button" onClick={() => jumpTo(index)} className={index === activeIndex ? 'is-active' : ''} style={{ '--route-color': scene.accent }}><span>{scene.label}</span><i /></button>)}
        </div>
        <div className="world-scroll-hint"><ArrowDown size={15} /><span>{progress > 0.04 ? 'keep going' : 'scroll to enter'}</span></div>
        <div className="world-progress"><span style={{ transform: `scaleX(${progress})` }} /></div>
      </div>
    </section>
  )
}

function LandingHeader({ onLogin }) {
  const [open, setOpen] = useState(false)
  const go = (id) => { setOpen(false); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }) }
  return (
    <header className="cinematic-header">
      <a href="#top" className="landing-brand"><span className="landing-brand-mark"><img src="/logo.png" alt="" /></span><span>Promptly<span className="landing-brand-dot">.</span></span></a>
      <nav className={`landing-nav ${open ? 'is-open' : ''}`}>
        <button type="button" onClick={() => go('journey')}>The journey</button>
        <button type="button" onClick={() => go('capabilities')}>Capabilities</button>
        <button type="button" onClick={() => go('demo')}>Try the agent</button>
      </nav>
      <div className="landing-header-actions"><button type="button" className="landing-login" onClick={onLogin}>Log in</button><button type="button" className="landing-header-cta" onClick={onLogin}>Get started <ArrowUpRight size={14} /></button><button type="button" className="landing-menu" aria-label="Toggle menu" onClick={() => setOpen((value) => !value)}>{open ? <X size={20} /> : <Menu size={20} />}</button></div>
    </header>
  )
}

function PromptDemo() {
  const [value, setValue] = useState('When a new application arrives, ask me to approve it.')
  const [submitted, setSubmitted] = useState(false)
  return (
    <div className="prompt-demo-shell">
      <div className="prompt-demo-top"><div className="prompt-demo-brand"><span className="prompt-demo-icon"><Sparkles size={13} /></span><div><strong>Ask Promptly</strong><span>workspace copilot</span></div></div><span className="demo-live"><span className="pulse-dot" /> online</span></div>
      <div className="prompt-demo-body">
        <div className="demo-bubble demo-bubble-assistant"><span className="demo-avatar"><Sparkles size={12} /></span><div><p>What should happen next?</p><small>Describe an outcome. I’ll turn it into a plan you can review.</small></div></div>
        <div className="demo-bubble demo-bubble-user"><p>{value || 'Describe what you want to automate…'}</p></div>
        {submitted && <div className="demo-plan"><div className="demo-plan-head"><span className="pulse-dot" /> plan ready for review <span>3 steps</span></div><div className="demo-plan-step"><span>01</span><div><strong>Form submission</strong><small>Start when a new application arrives</small></div><Check size={14} /></div><div className="demo-plan-step"><span>02</span><div><strong>Approval gate</strong><small>Pause until you decide</small></div><Check size={14} /></div><div className="demo-plan-step"><span>03</span><div><strong>Send next step</strong><small>Invite or thank the applicant</small></div><Check size={14} /></div></div>}
      </div>
      <form className="prompt-demo-input" onSubmit={(event) => { event.preventDefault(); setSubmitted(true) }}><Command size={15} /><input value={value} onChange={(event) => { setValue(event.target.value); setSubmitted(false) }} aria-label="Describe an automation" /><button type="submit" aria-label="Create plan"><ArrowRight size={16} /></button></form>
      <div className="prompt-demo-footer"><span>Try a prompt</span><button type="button" onClick={() => { setValue('Summarize new support tickets every Monday.'); setSubmitted(false) }}>Summarize tickets</button><button type="button" onClick={() => { setValue('Send a follow-up when an invoice is overdue.'); setSubmitted(false) }}>Follow up on invoices</button></div>
    </div>
  )
}

function LandingPage({ onLogin, onSecurity }) {
  return (
    <div className="promptly-cinematic-landing">
      <LandingHeader onLogin={onLogin} />
      <main>
        <section id="top" className="landing-hero-cinematic">
          <div className="hero-cinematic-orb hero-cinematic-orb-one" /><div className="hero-cinematic-orb hero-cinematic-orb-two" />
          <div className="hero-cinematic-copy"><span className="hero-cinematic-kicker"><span className="pulse-dot" /> the calm way to automate operations</span><h1>Make work move<br /><em>forward.</em></h1><p>Promptly turns the outcome in your head into a workflow your team can see, review, and trust.</p><div className="hero-cinematic-actions"><button type="button" onClick={onLogin} className="hero-primary">Start building <ArrowUpRight size={17} /></button><a href="#journey" className="hero-secondary"><Play size={15} fill="currentColor" /> Fly through the product</a></div><div className="hero-proof"><span><CircleCheck size={14} /> Human review built in</span><span><CircleCheck size={14} /> Every run explained</span><span><CircleCheck size={14} /> Start free</span></div></div>
          <div className="hero-cinematic-signal"><div className="signal-line signal-line-one" /><div className="signal-line signal-line-two" /><div className="signal-label signal-label-top"><span className="pulse-dot" /> AI workspace / ready</div><div className="signal-label signal-label-bottom"><span>01</span> intent → workflow → run</div></div>
          <div className="hero-cinematic-bottom"><span>Promptly / 2026</span><span>Scroll-driven product tour <ArrowDown size={14} /></span></div>
        </section>

        <ScrollWorld />

        <section id="capabilities" className="capabilities-section">
          <div className="section-shell"><div className="section-intro"><span className="section-kicker">A better operating surface</span><h2>Automation should feel<br /><em>legible.</em></h2><p>Promptly gives the invisible work a visible shape — from the first sentence to the last execution event.</p></div><div className="capability-list">{CAPABILITIES.map(({ icon: Icon, number, title, copy }) => <article key={number} className="capability-row"><span className="capability-number">{number}</span><span className="capability-icon"><Icon size={20} /></span><div><h3>{title}</h3><p>{copy}</p></div><ArrowUpRight className="capability-arrow" size={18} /></article>)}</div></div>
        </section>

        <section id="demo" className="demo-section"><div className="demo-shell"><div className="demo-copy"><span className="section-kicker section-kicker-light">A small taste of the workspace</span><h2>Say what needs doing.<br /><em>See what comes back.</em></h2><p>No canvas choreography to learn. No maze of settings before you can begin. Start with the thing you want to be true.</p><div className="demo-stat-row"><div><strong>01</strong><span>describe</span></div><div><strong>02</strong><span>review</span></div><div><strong>03</strong><span>run</span></div></div></div><PromptDemo /></div></section>

        <section id="start" className="landing-cta-cinematic"><div className="cta-glow" /><span className="section-kicker">Your next workflow is closer than it feels</span><h2>Give the busywork<br /><em>a better ending.</em></h2><p>Build a calm, reviewable way to move work forward — one sentence at a time.</p><button type="button" onClick={onLogin} className="hero-primary">Start with Promptly <ArrowUpRight size={17} /></button><div className="cta-footnote"><Clock3 size={14} /> Takes a few minutes to get started</div></section>
      </main>

      <footer className="cinematic-footer"><div className="footer-brand"><span className="landing-brand-mark"><img src="/logo.png" alt="" /></span><span>Promptly<span className="landing-brand-dot">.</span></span><small>Make work move forward.</small></div><div className="footer-links"><a href="#journey">The journey</a><a href="#capabilities">Capabilities</a><a href="#demo">Try the agent</a><button type="button" onClick={onSecurity}>Security</button></div><span className="footer-copyright">© {new Date().getFullYear()} Promptly</span></footer>
    </div>
  )
}

export default LandingPage
