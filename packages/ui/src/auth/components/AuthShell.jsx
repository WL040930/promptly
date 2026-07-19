
function AuthShell({ icon, title, subtitle, children }) {
    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4 font-sans relative overflow-hidden">
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-200/50 rounded-full blur-[100px] pointer-events-none" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-200/50 rounded-full blur-[100px] pointer-events-none" />

            <div className="bg-white/80 backdrop-blur-xl border border-white shadow-2xl rounded-3xl p-8 sm:p-10 max-w-[420px] w-full relative z-10">
                <div className="text-center mb-8">
                    <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-sm border border-indigo-100/50">
                        {icon}
                    </div>
                    <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight mb-2">{title}</h2>
                    <p className="text-slate-500 font-medium">{subtitle}</p>
                </div>

                {children}
            </div>
        </div>
    )
}

export default AuthShell
