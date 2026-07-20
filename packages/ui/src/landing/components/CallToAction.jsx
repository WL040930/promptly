
function CallToAction({
  title,
  description,
  primaryLabel,
  onPrimaryClick,
  secondaryLabel,
  onSecondaryClick
}) {
  return (
    <section className="landing-ink-panel relative overflow-hidden py-24">
      <div className="absolute right-0 top-0 h-64 w-64 -translate-y-1/2 translate-x-1/2 rounded-full bg-[#c8f17b]/10"></div>
      <div className="absolute bottom-0 left-0 h-96 w-96 -translate-x-1/2 translate-y-1/2 rounded-full bg-[#5b4ee8]/30"></div>

      <div className="max-w-4xl mx-auto px-4 text-center relative z-10">
        <h2 className="mb-6 font-display text-4xl font-bold leading-tight tracking-[-0.04em] text-white md:text-5xl">{title}</h2>
        <p className="mx-auto mb-10 max-w-2xl text-lg leading-8 text-slate-300">{description}</p>
        <div className="flex flex-col sm:flex-row justify-center items-center gap-4 sm:gap-6">
          {primaryLabel && (
            <button
              type="button"
              onClick={onPrimaryClick}
              className="w-full rounded-xl bg-[#c8f17b] px-8 py-4 text-lg font-bold text-[#171827] shadow-2xl transition-all hover:-translate-y-1 hover:bg-[#d5f89b] active:scale-95 sm:w-auto"
            >
              {primaryLabel}
            </button>
          )}

          {secondaryLabel && (
            <button
              type="button"
              onClick={onSecondaryClick}
              className="w-full rounded-xl border border-white/15 bg-white/10 px-8 py-4 text-lg font-bold text-white transition-all hover:bg-white/15 active:scale-95 sm:w-auto"
            >
              {secondaryLabel}
            </button>
          )}
        </div>
      </div>
    </section>
  )
}

export default CallToAction
