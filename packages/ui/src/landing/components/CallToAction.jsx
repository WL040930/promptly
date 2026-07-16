import React from 'react'

function CallToAction({
  title,
  description,
  primaryLabel,
  onPrimaryClick,
  secondaryLabel,
  onSecondaryClick
}) {
  return (
    <section className="py-24 bg-indigo-600 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2"></div>

      <div className="max-w-4xl mx-auto px-4 text-center relative z-10">
        <h2 className="text-4xl md:text-5xl font-bold text-white mb-6 leading-tight">{title}</h2>
        <p className="text-xl text-indigo-100 mb-10 max-w-2xl mx-auto">{description}</p>
        <div className="flex flex-col sm:flex-row justify-center items-center gap-4 sm:gap-6">
          {primaryLabel && (
            <button
              type="button"
              onClick={onPrimaryClick}
              className="w-full sm:w-auto bg-white text-indigo-600 px-10 py-4 rounded-xl font-bold text-lg hover:bg-slate-50 transition-all shadow-2xl hover:scale-105 active:scale-95"
            >
              {primaryLabel}
            </button>
          )}

          {secondaryLabel && (
            <button
              type="button"
              onClick={onSecondaryClick}
              className="w-full sm:w-auto bg-indigo-700 text-white border border-white/20 px-10 py-4 rounded-xl font-bold text-lg hover:bg-indigo-800 transition-all active:scale-95"
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
