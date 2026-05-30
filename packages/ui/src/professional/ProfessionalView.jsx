import React, { useState } from 'react';

const ProfessionalView = () => {
    const [rawPrompt, setRawPrompt] = useState('Write an email response to {{clientName}} regarding their ticket {{ticketId}}.');
    const [clientName, setClientName] = useState('John Doe');
    const [ticketId, setTicketId] = useState('INC-99081');
    const [sandboxResult, setSandboxResult] = useState('');
    const [isCompiling, setIsCompiling] = useState(false);

    const handleCompile = () => {
        setIsCompiling(true);
        setTimeout(() => {
            const compiled = rawPrompt
                .replace(/\{\{\s*clientName\s*\}\}/g, clientName)
                .replace(/\{\{\s*ticketId\s*\}\}/g, ticketId);
            
            const simulatedJson = JSON.stringify({
                status: 'success',
                tokensUsed: Math.floor(Math.random() * 80) + 120,
                latencyMs: Math.floor(Math.random() * 200) + 150,
                promptTokens: compiled.length,
                payload: {
                    template: rawPrompt,
                    resolvedBody: compiled,
                    systemParameters: {
                        model: 'prompty-ultra-v3',
                        temperature: 0.15,
                        top_p: 0.95
                    }
                }
            }, null, 4);

            setSandboxResult(simulatedJson);
            setIsCompiling(false);
        }, 800);
    };

    return (
        <div className="flex-1 flex flex-col w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 gap-8 font-['Space_Grotesk','Manrope',sans-serif]">
            
            {/* Header Section */}
            <div className="flex items-end justify-between border-b border-slate-200 pb-4">
                <div>
                    <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Professional Workspace</h1>
                    <p className="text-slate-500 font-medium mt-1">Advanced prompt templates, metrics, and integrations.</p>
                </div>
                <div className="hidden sm:flex gap-2">
                    <button className="ghost text-sm py-1.5 px-3 rounded-lg">View Documentation</button>
                    <button className="solid text-sm py-1.5 px-3 rounded-lg flex items-center gap-2">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline></svg>
                        Export Report
                    </button>
                </div>
            </div>

            {/* Upper Widgets */}
            <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                {/* Latency Widget */}
                <div className="stat-card flex flex-col gap-4 group">
                    <div className="flex justify-between items-center">
                        <span className="eyebrow text-slate-500">API Latency</span>
                        <span className="text-[0.7rem] font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-600 border border-emerald-100">Optimal</span>
                    </div>
                    {/* SVG Chart */}
                    <div className="h-16 w-full relative -mx-2 px-2 overflow-hidden">
                        <svg viewBox="0 0 100 30" width="100%" height="100%" preserveAspectRatio="none" className="overflow-visible">
                            <defs>
                                <linearGradient id="latencyGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.2" />
                                    <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
                                </linearGradient>
                            </defs>
                            <path d="M0,25 Q15,10 30,18 T60,5 T90,12 L100,8 L100,30 L0,30 Z" fill="url(#latencyGrad)" className="transition-all duration-300 group-hover:opacity-80" />
                            <path d="M0,25 Q15,10 30,18 T60,5 T90,12 L100,8" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" className="transition-all duration-300 group-hover:stroke-blue-600" />
                        </svg>
                    </div>
                    <div className="flex justify-between text-sm text-slate-500 items-end">
                        <span className="font-semibold">Average</span>
                        <span className="text-2xl font-extrabold text-slate-900">182ms</span>
                    </div>
                </div>

                {/* Token Widget */}
                <div className="stat-card flex flex-col gap-4 group">
                    <div className="flex justify-between items-center">
                        <span className="eyebrow text-slate-500">Token Usage</span>
                        <span className="text-[0.7rem] font-bold px-2 py-0.5 rounded-md bg-cyan-50 text-cyan-600 border border-cyan-100">68% Quota</span>
                    </div>
                    {/* SVG Chart */}
                    <div className="h-16 w-full relative -mx-2 px-2 overflow-hidden">
                        <svg viewBox="0 0 100 30" width="100%" height="100%" preserveAspectRatio="none" className="overflow-visible">
                            <defs>
                                <linearGradient id="tokenGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.2" />
                                    <stop offset="100%" stopColor="#06b6d4" stopOpacity="0" />
                                </linearGradient>
                            </defs>
                            <path d="M0,20 Q20,28 40,15 T80,8 L100,18 L100,30 L0,30 Z" fill="url(#tokenGrad)" className="transition-all duration-300 group-hover:opacity-80" />
                            <path d="M0,20 Q20,28 40,15 T80,8 L100,18" fill="none" stroke="#06b6d4" strokeWidth="2" strokeLinecap="round" className="transition-all duration-300 group-hover:stroke-cyan-600" />
                        </svg>
                    </div>
                    <div className="flex justify-between text-sm text-slate-500 items-end">
                        <span className="font-semibold">Current Month</span>
                        <span className="text-2xl font-extrabold text-slate-900">882k</span>
                    </div>
                </div>

                {/* Integrations Widget */}
                <div className="stat-card flex flex-col justify-between group">
                    <span className="eyebrow text-slate-500 mb-2">🟢 Integrations</span>
                    <div className="flex flex-col gap-3 my-2 flex-1 justify-center">
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-bold text-slate-700">Postgres DB</span>
                            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-100">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                <span className="text-[0.65rem] font-bold text-emerald-600 uppercase">Live</span>
                            </div>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-bold text-slate-700">Prompty API</span>
                            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-100">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" style={{ animationDelay: '0.5s' }}></span>
                                <span className="text-[0.65rem] font-bold text-emerald-600 uppercase">Live</span>
                            </div>
                        </div>
                    </div>
                    <div className="text-[0.7rem] text-slate-400 font-semibold text-right pt-2 border-t border-slate-100 mt-2">
                        SSL: SECURED TLS 1.3
                    </div>
                </div>
            </section>

            {/* Sandbox Section */}
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-8 flex-1">
                {/* Sandbox Inputs */}
                <div className="card flex flex-col gap-6">
                    <div>
                        <h2 className="text-xl font-bold text-slate-900 mb-1 flex items-center gap-2">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-blue-600"><polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line></svg>
                            Raw Prompt Sandbox
                        </h2>
                        <p className="text-slate-500 text-sm font-medium">
                            Enter templates with variables like <code className="bg-slate-100 text-blue-600 px-1 py-0.5 rounded">{"{{clientName}}"}</code>.
                        </p>
                    </div>

                    <div className="flex flex-col gap-2">
                        <label className="text-sm font-bold text-slate-600">Template String</label>
                        <textarea
                            value={rawPrompt}
                            onChange={(e) => setRawPrompt(e.target.value)}
                            rows="4"
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-mono text-sm p-4 outline-none resize-none focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10 transition-all shadow-inner"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-bold text-slate-600">clientName</label>
                            <input
                                type="text"
                                value={clientName}
                                onChange={(e) => setClientName(e.target.value)}
                                className="bg-slate-50 border border-slate-200 rounded-lg text-slate-800 px-3 py-2 outline-none text-sm font-medium focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10 transition-all shadow-inner"
                            />
                        </div>
                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-bold text-slate-600">ticketId</label>
                            <input
                                type="text"
                                value={ticketId}
                                onChange={(e) => setTicketId(e.target.value)}
                                className="bg-slate-50 border border-slate-200 rounded-lg text-slate-800 px-3 py-2 outline-none text-sm font-medium focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10 transition-all shadow-inner"
                            />
                        </div>
                    </div>

                    <button
                        onClick={handleCompile}
                        disabled={isCompiling}
                        className={`mt-2 w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${
                            isCompiling 
                                ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed' 
                                : 'bg-slate-900 text-white shadow-lg hover:shadow-xl hover:bg-slate-800 hover:-translate-y-0.5 cursor-pointer'
                        }`}
                    >
                        {isCompiling ? (
                            <>
                                <span className="w-4 h-4 border-2 border-slate-300 border-t-slate-500 rounded-full animate-spin"></span>
                                Compiling Payload...
                            </>
                        ) : (
                            'Compile Sandbox Request'
                        )}
                    </button>
                </div>

                {/* Sandbox Outputs */}
                <div className="card bg-slate-900 border-slate-800 flex flex-col gap-4 shadow-2xl relative overflow-hidden">
                    {/* Decorative glow */}
                    <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-[60px] pointer-events-none"></div>

                    <div className="flex justify-between items-center relative z-10">
                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                            Terminal Output
                        </h2>
                        <div className="flex gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full bg-slate-600"></span>
                            <span className="w-2.5 h-2.5 rounded-full bg-slate-600"></span>
                            <span className={`w-2.5 h-2.5 rounded-full ${isCompiling ? 'bg-yellow-400 animate-pulse' : sandboxResult ? 'bg-emerald-400' : 'bg-slate-600'}`}></span>
                        </div>
                    </div>

                    <div className="flex-1 bg-slate-950/50 border border-slate-800 rounded-xl p-5 font-mono text-[0.85rem] text-blue-300 whitespace-pre-wrap overflow-y-auto min-h-[260px] shadow-inner relative z-10">
                        {isCompiling ? (
                            <span className="text-yellow-400 animate-pulse">$ prompty compiler --input --watch ...</span>
                        ) : sandboxResult ? (
                            <span dangerouslySetInnerHTML={{ __html: sandboxResult.replace(/"(.*?)":/g, '<span class="text-blue-200">"$1"</span>:').replace(/:\s"(.*?)"/g, ': <span class="text-emerald-300">"$1"</span>').replace(/:\s(\d+)/g, ': <span class="text-orange-300">$1</span>') }} />
                        ) : (
                            <span className="text-slate-600">Console idle. Click compile to trigger simulated schema mapping output.</span>
                        )}
                    </div>
                </div>
            </section>
        </div>
    );
};

export default ProfessionalView;
