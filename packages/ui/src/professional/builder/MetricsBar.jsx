import React from 'react';

const MetricsBar = () => {
    return (
        <div className="flex items-center gap-6 text-[0.75rem] font-bold text-slate-500 bg-slate-50 border border-slate-200 px-4 py-2 rounded-lg shadow-sm">
            <div className="flex items-center gap-2">
                <span className="text-slate-400 uppercase tracking-wider">Latency</span>
                <span className="text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">182ms</span>
            </div>
            <div className="w-px h-4 bg-slate-200"></div>
            <div className="flex items-center gap-2">
                <span className="text-slate-400 uppercase tracking-wider">Tokens Used</span>
                <span className="text-slate-700">882k <span className="text-slate-400">/ 1.2M</span></span>
            </div>
            <div className="w-px h-4 bg-slate-200"></div>
            <div className="flex items-center gap-2">
                <span className="text-slate-400 uppercase tracking-wider">Postgres DB</span>
                <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span className="text-emerald-600">Live</span>
                </div>
            </div>
        </div>
    );
};

export default MetricsBar;
