import React from 'react';

const StatsCards = ({ activeWorkflowCount }) => {
    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm relative overflow-hidden group">
                <div className="absolute -right-4 -top-4 w-20 h-20 bg-green-500/10 rounded-full blur-2xl group-hover:bg-green-500/20 transition-all"></div>
                <div className="flex items-center justify-between mb-3 relative z-10">
                    <span className="text-sm font-bold text-slate-500 uppercase tracking-wider">Active Automations</span>
                    <div className="w-8 h-8 rounded-full bg-green-50 flex items-center justify-center">
                        <div className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse"></div>
                    </div>
                </div>
                <div className="flex items-baseline gap-3 relative z-10">
                    <span className="text-3xl font-extrabold text-slate-900">{activeWorkflowCount}</span>
                    <span className="text-xs font-semibold text-green-600 flex items-center gap-0.5">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"></polyline><polyline points="16 7 22 7 22 13"></polyline></svg>
                        Running now
                    </span>
                </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm relative overflow-hidden group">
                <div className="absolute -right-4 -top-4 w-20 h-20 bg-blue-500/10 rounded-full blur-2xl group-hover:bg-blue-500/20 transition-all"></div>
                <div className="flex items-center justify-between mb-3 relative z-10">
                    <span className="text-sm font-bold text-slate-500 uppercase tracking-wider">Avg Success Rate</span>
                    <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="16 12 12 8 8 12"></polyline><line x1="12" y1="16" x2="12" y2="8"></line></svg>
                    </div>
                </div>
                <div className="flex items-baseline gap-3 relative z-10">
                    <span className="text-3xl font-extrabold text-slate-900">99.8%</span>
                    <span className="text-xs font-semibold text-slate-400">Past 30 days</span>
                </div>
            </div>

            <div className="bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-800 rounded-3xl p-5 shadow-xl relative overflow-hidden group">
                <div className="absolute -right-4 -top-4 w-20 h-20 bg-cyan-500/20 rounded-full blur-2xl group-hover:bg-cyan-500/30 transition-all"></div>
                <div className="flex items-center justify-between mb-3 relative z-10">
                    <span className="text-sm font-bold text-slate-400 uppercase tracking-wider">AI Tokens Saved</span>
                    <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-cyan-400">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
                    </div>
                </div>
                <div className="flex items-baseline gap-3 relative z-10">
                    <span className="text-3xl font-extrabold text-white">14.2M</span>
                    <span className="text-xs font-semibold text-cyan-400">Optimal</span>
                </div>
            </div>
        </div>
    );
};

export default StatsCards;
