
function AuthShell({ icon, title, subtitle, children }) {
    return (
        <div className="surface-grid relative flex min-h-screen items-center justify-center overflow-hidden p-4 font-sans">
            <div className="pointer-events-none absolute left-[-12%] top-[-16%] h-[46%] w-[46%] rounded-full bg-[#bdb7ff]/30 blur-[110px]" />
            <div className="pointer-events-none absolute bottom-[-16%] right-[-12%] h-[46%] w-[46%] rounded-full bg-[#c8f17b]/20 blur-[120px]" />

            <div className="relative z-10 w-full max-w-[430px] rounded-[2rem] border border-white/80 bg-white/90 p-8 shadow-[0_28px_70px_rgba(23,24,39,0.14)] backdrop-blur-xl sm:p-10">
                <div className="mb-8 text-center">
                    <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#171827] text-[#c8f17b] shadow-lg shadow-[#171827]/20">
                        {icon}
                    </div>
                    <div className="mb-5 flex items-center justify-center gap-2"><img src="/logo.png" alt="Promptly" className="h-6 w-6 rounded-lg" /><span className="font-display text-sm font-bold tracking-tight text-[#171827]">Promptly</span></div>
                    <h2 className="font-display text-3xl font-bold tracking-tight text-[#171827]">{title}</h2>
                    <p className="mt-2 text-sm font-medium text-slate-500">{subtitle}</p>
                </div>

                {children}
            </div>
        </div>
    )
}

export default AuthShell
