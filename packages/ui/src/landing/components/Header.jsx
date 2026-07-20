
const NAV_OFFSET = 80

function scrollToSection(id) {
  const el = document.getElementById(id)
  if (!el) return
  const y = el.getBoundingClientRect().top + window.scrollY - NAV_OFFSET
  window.scrollTo({ top: y, behavior: 'smooth' })
}

function Header({ onLogin, onHome }) {
  return (
    <header className="fixed left-0 right-0 top-0 z-50 border-b border-slate-200/70 bg-[#f8f8fc]/85 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <button type="button" onClick={onHome} disabled={!onHome} className={`flex items-center gap-2 ${onHome ? 'cursor-pointer' : 'cursor-default'}`}>
            <img src="/logo.png" alt="Promptly Logo" className="h-8 w-8 rounded-[10px] object-contain shadow-sm" />
            <span className="font-display text-xl font-bold tracking-tight text-[#171827]">Promptly<span className="text-[#5b4ee8]">.</span></span>
          </button>
          <nav className="hidden items-center gap-8 md:flex">
            {onHome ? (
              <button type="button" onClick={onHome} className="text-sm font-semibold text-slate-600 transition-colors hover:text-[#5b4ee8]">Back to home</button>
            ) : (
              <>
                <a href="#features" onClick={(e) => { e.preventDefault(); scrollToSection('features') }} className="text-sm font-semibold text-slate-600 transition-colors hover:text-[#5b4ee8]">Capabilities</a>
                <a href="#how-it-works" onClick={(e) => { e.preventDefault(); scrollToSection('how-it-works') }} className="text-sm font-semibold text-slate-600 transition-colors hover:text-[#5b4ee8]">How it works</a>
                <a href="#demo" onClick={(e) => { e.preventDefault(); scrollToSection('demo') }} className="text-sm font-semibold text-slate-600 transition-colors hover:text-[#5b4ee8]">Try it</a>
              </>
            )}
          </nav>
          <div className="flex items-center gap-4">
            <button
              onClick={() => {
                if (onLogin) onLogin()
                else window.location.href = '/login'
              }}
              className="hidden text-sm font-semibold text-slate-600 transition-colors hover:text-[#5b4ee8] sm:inline-flex"
            >
              Log in
            </button>
            <button
              onClick={() => onHome ? onLogin?.() : scrollToSection('demo')}
              className="rounded-xl bg-[#171827] px-4 py-2.5 text-sm font-bold text-white shadow-[0_8px_18px_rgba(23,24,39,0.16)] transition-all hover:-translate-y-0.5 hover:bg-[#252438] active:scale-95"
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
