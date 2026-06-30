import React from 'react';

const StatsCards = ({ activeWorkflowCount }) => {
    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                <div className="h-1 bg-gradient-to-r from-emerald-500 to-teal-500"></div>
                <div className="p-5">
                    <div className="flex items-center justify-between mb-4">
                        <span className="text-xs font-medium text-slate-500">Active Automations</span>
                        <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
                            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                        </div>
                    </div>
                    <div className="flex items-baseline gap-2.5">
                        <span className="text-3xl font-semibold text-slate-900 tracking-tight">{activeWorkflowCount}</span>
                        <span className="text-xs font-medium text-emerald-600 flex items-center gap-1">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"></polyline><polyline points="16 7 22 7 22 13"></polyline></svg>
                            Running now
                        </span>
                    </div>
                </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                <div className="h-1 bg-gradient-to-r from-indigo-500 to-indigo-500"></div>
                <div className="p-5">
                    <div className="flex items-center justify-between mb-4">
                        <span className="text-xs font-medium text-slate-500">Avg Success Rate</span>
                        <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-500">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                        </div>
                    </div>
                    <div className="flex items-baseline gap-2.5">
                        <span className="text-3xl font-semibold text-slate-900 tracking-tight">99.8%</span>
                        <span className="text-xs font-medium text-slate-400">Past 30 days</span>
                    </div>
                </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                <div className="h-1 bg-gradient-to-r from-cyan-500 to-sky-500"></div>
                <div className="p-5">
                    <div className="flex items-center justify-between mb-4">
                        <span className="text-xs font-medium text-slate-500">AI Tokens Saved</span>
                        <div className="w-8 h-8 rounded-lg bg-cyan-50 flex items-center justify-center text-cyan-500">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
                        </div>
                    </div>
                    <div className="flex items-baseline gap-2.5">
                        <span className="text-3xl font-semibold text-slate-900 tracking-tight">14.2M</span>
                        <span className="text-xs font-medium text-cyan-600">Optimal</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default StatsCards;
