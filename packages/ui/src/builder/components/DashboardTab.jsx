import React, { useMemo } from 'react';

const RECENT_ACTIVITIES = [
    { id: 1, action: 'Workflow Run Success', detail: 'Welcome Email Sequence executed successfully for customer lim@gmail.com', time: '5 mins ago', type: 'success', latency: '412ms' },
    { id: 2, action: 'Jira Ticket Created', detail: 'Support Ticket Automation created ticket PR-401 for urgency high email', time: '1 hour ago', type: 'success', latency: '1.2s' },
    { id: 3, action: 'Postgres Metric Fetched', detail: 'Weekly Analytics Engine completed query, returned 4,812 active users', time: '3 hours ago', type: 'success', latency: '240ms' },
    { id: 4, action: 'Workflow Trigger Failed', detail: 'Weekly Analytics Engine database connection timeout. Retrying in 1 hour', time: 'yesterday', type: 'error', latency: '12.0s' }
];

const INTEGRATIONS = [
    { name: 'OpenAI GPT-4o', category: 'Language Model', status: 'Healthy', uptime: '99.9%', color: 'indigo' },
    { name: 'Stripe Webhook', category: 'Payment gateway', status: 'Healthy', uptime: '100%', color: 'emerald' },
    { name: 'Slack Bot API', category: 'Chat Platform', status: 'Healthy', uptime: '100%', color: 'orange' },
    { name: 'Resend SMTP', category: 'Email Service', status: 'Healthy', uptime: '99.7%', color: 'blue' },
    { name: 'PostgreSQL DB', category: 'Database Storage', status: 'Healthy', uptime: '100%', color: 'cyan' }
];

const WEEKLY_DATA = [
    { day: 'Mon', runs: 320, successRate: '100%' },
    { day: 'Tue', runs: 410, successRate: '99.8%' },
    { day: 'Wed', runs: 580, successRate: '99.5%' },
    { day: 'Thu', runs: 390, successRate: '100%' },
    { day: 'Fri', runs: 640, successRate: '99.8%' },
    { day: 'Sat', runs: 120, successRate: '100%' },
    { day: 'Sun', runs: 150, successRate: '100%' }
];

const DashboardTab = ({ activeWorkflowCount, onNavigateTab }) => {
    
    // Find highest run count to normalize SVG chart bars
    const maxRuns = useMemo(() => Math.max(...WEEKLY_DATA.map(d => d.runs)), []);

    return (
        <div className="flex-1 overflow-y-auto bg-slate-50 font-sans p-6 md:p-8 animate-fade-in relative">
            <div className="max-w-6xl mx-auto flex flex-col gap-6">
                
                {/* 1. Hero Systems Status Welcome Banner */}
                <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-3xl p-6 shadow-xl relative overflow-hidden flex items-center justify-between gap-6 min-h-[140px] group border border-slate-800">
                    <div className="absolute -right-10 -bottom-10 w-44 h-44 bg-blue-500/10 rounded-full blur-3xl group-hover:bg-blue-500/20 transition-all duration-700"></div>
                    <div className="absolute left-1/3 -top-10 w-36 h-36 bg-indigo-500/10 rounded-full blur-3xl group-hover:bg-indigo-500/25 transition-all duration-700"></div>
                    
                    <div className="relative z-10 flex flex-col gap-1.5">
                        <span className="text-xs font-bold uppercase tracking-wider text-indigo-405 text-indigo-400">Workspace Status Overview</span>
                        <h2 className="text-2xl font-extrabold tracking-tight">Welcome to Promptly Workspace</h2>
                        <p className="text-slate-350 font-medium text-xs sm:text-sm max-w-xl leading-relaxed mt-0.5">
                            All automated triggers are active. 5 integrations are online and performing within normal latencies.
                        </p>
                    </div>

                    <div className="relative z-10 shrink-0 hidden sm:flex items-center gap-2 bg-white/10 backdrop-blur-md px-3.5 py-2 rounded-2xl border border-white/10 shadow-inner">
                        <span className="w-2.5 h-2.5 bg-emerald-400 rounded-full animate-ping"></span>
                        <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full absolute"></span>
                        <span className="text-xs sm:text-sm font-bold tracking-tight pl-2">System Healthy</span>
                    </div>
                </div>

                {/* 2. Premium 4-Column KPI Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* KPI 1 */}
                    <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm relative overflow-hidden group">
                        <div className="flex justify-between items-start mb-3">
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Active Automations</span>
                            <span className="w-7 h-7 rounded-xl bg-indigo-50 text-indigo-650 flex items-center justify-center shrink-0">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline></svg>
                            </span>
                        </div>
                        <div className="flex items-baseline gap-2 mt-1">
                            <span className="text-3xl font-extrabold text-slate-900 tracking-tight">{activeWorkflowCount}</span>
                            <span className="text-xs font-bold text-emerald-650 bg-emerald-55 bg-emerald-50 px-2 py-0.5 rounded tracking-wide">Syncing</span>
                        </div>
                        <p className="text-xs font-medium text-slate-450 text-slate-500 mt-2">Active triggers polling live data</p>
                    </div>

                    {/* KPI 2 */}
                    <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm relative overflow-hidden group">
                        <div className="flex justify-between items-start mb-3">
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Avg Success Rate</span>
                            <span className="w-7 h-7 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                            </span>
                        </div>
                        <div className="flex items-baseline gap-2 mt-1">
                            <span className="text-3xl font-extrabold text-slate-900 tracking-tight">99.8%</span>
                            <span className="text-xs font-bold text-blue-650 bg-blue-50 px-2 py-0.5 rounded tracking-wide">Target Met</span>
                        </div>
                        <p className="text-xs font-medium text-slate-500 mt-2">1 fail in 15.2k execution cycles</p>
                    </div>

                    {/* KPI 3 */}
                    <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm relative overflow-hidden group">
                        <div className="flex justify-between items-start mb-3">
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Run Volume</span>
                            <span className="w-7 h-7 rounded-xl bg-orange-50 text-orange-655 text-orange-600 flex items-center justify-center shrink-0">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>
                            </span>
                        </div>
                        <div className="flex items-baseline gap-2 mt-1">
                            <span className="text-3xl font-extrabold text-slate-900 tracking-tight">2,785</span>
                            <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded tracking-wide">+12% MoM</span>
                        </div>
                        <p className="text-xs font-medium text-slate-500 mt-2">Calculated run cycles past 30 days</p>
                    </div>

                    {/* KPI 4 */}
                    <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm relative overflow-hidden group">
                        <div className="flex justify-between items-start mb-3">
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">AI Tokens Saved</span>
                            <span className="w-7 h-7 rounded-xl bg-cyan-50 text-cyan-650 flex items-center justify-center shrink-0">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
                            </span>
                        </div>
                        <div className="flex items-baseline gap-2 mt-1">
                            <span className="text-3xl font-extrabold text-slate-900 tracking-tight">14.2M</span>
                            <span className="text-xs font-bold text-cyan-600 bg-cyan-50 px-2 py-0.5 rounded tracking-wide">Optimal</span>
                        </div>
                        <p className="text-xs font-medium text-slate-500 mt-2">Saved via cached query templates</p>
                    </div>
                </div>

                {/* 3. Mid Section: SVG Run Chart & Quick Actions */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* SVG Chart: Automation Runs Volume */}
                    <div className="lg:col-span-2 bg-white border border-slate-200 rounded-3xl p-5 shadow-sm flex flex-col gap-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="font-bold text-slate-800 text-sm sm:text-base">Execution Volume Trends</h3>
                                <p className="text-slate-400 font-medium text-xs mt-0.5">Executions mapped per weekday</p>
                            </div>
                            <span className="text-xs font-bold text-slate-500 bg-slate-55 bg-slate-50 px-3 py-1 rounded border border-slate-100 uppercase tracking-wide">Past 7 Days</span>
                        </div>

                        {/* Rendering custom SVG bar chart */}
                        <div className="w-full relative h-[160px] flex items-end justify-between px-2 pt-4">
                            {WEEKLY_DATA.map((data, index) => {
                                const heightPercentage = (data.runs / maxRuns) * 110; // Max height inside container 110px
                                return (
                                    <div key={index} className="flex flex-col items-center gap-2 flex-1 group">
                                        {/* Run volume tooltip */}
                                        <div className="opacity-0 group-hover:opacity-100 absolute bg-slate-800 text-white font-extrabold text-xs px-2.5 py-1 rounded-lg -translate-y-9 shadow-md transition-opacity pointer-events-none z-10">
                                            {data.runs} runs
                                        </div>
                                        {/* Visual bar */}
                                        <div 
                                            style={{ height: `${heightPercentage}px` }}
                                            className="w-8 rounded-t-lg bg-gradient-to-t from-indigo-500 to-indigo-400 group-hover:from-indigo-600 group-hover:to-indigo-500 hover:shadow-lg transition-all duration-300 relative overflow-hidden"
                                        >
                                            <div className="absolute inset-0 bg-gradient-to-r from-white/10 to-transparent"></div>
                                        </div>
                                        <span className="text-xs font-bold text-slate-400">{data.day}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Quick Actions Panel */}
                    <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm flex flex-col justify-between gap-4">
                        <div>
                            <h3 className="font-bold text-slate-800 text-sm sm:text-base">Automation Workspace</h3>
                            <p className="text-slate-400 font-medium text-xs mt-0.5">Quick actions to design nodes & intake</p>
                        </div>
                        <div className="flex flex-col gap-2.5">
                            <button 
                                onClick={() => onNavigateTab?.('workflows')}
                                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs sm:text-sm py-3 px-4 rounded-xl shadow-md shadow-blue-500/10 hover:shadow-blue-500/20 active:scale-98 transition-all flex items-center justify-center gap-2"
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
                                Create automation flow
                            </button>
                            <button 
                                onClick={() => onNavigateTab?.('forms')}
                                className="w-full bg-slate-900 hover:bg-slate-950 text-white font-bold text-xs sm:text-sm py-3 px-4 rounded-xl shadow-md hover:shadow-lg active:scale-98 transition-all flex items-center justify-center gap-2"
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>
                                Design intake web form
                            </button>
                        </div>
                    </div>
                </div>

                {/* 4. Bottom Section: Connections Health & Live Ledger */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Connections health monitor */}
                    <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm flex flex-col gap-4">
                        <div>
                            <h3 className="font-bold text-slate-800 text-sm sm:text-base">Connected Integrations</h3>
                            <p className="text-slate-400 font-medium text-xs mt-0.5">Uptime logs for active API services</p>
                        </div>

                        <div className="flex flex-col gap-3">
                            {INTEGRATIONS.map((integration, index) => (
                                <div key={index} className="flex items-center justify-between">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className={`w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse`}></div>
                                        <div className="flex flex-col min-w-0">
                                            <span className="text-xs sm:text-sm font-bold text-slate-800 truncate">{integration.name}</span>
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide truncate">{integration.category}</span>
                                        </div>
                                    </div>
                                    <span className="text-xs font-bold text-emerald-650 bg-emerald-50 border border-emerald-100 px-2.5 py-0.5 rounded-md">{integration.uptime}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Activity Ledger Timeline */}
                    <div className="lg:col-span-2 bg-white border border-slate-200 rounded-3xl p-5 shadow-sm flex flex-col gap-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="font-bold text-slate-800 text-sm sm:text-base">Execution Activity Feed</h3>
                                <p className="text-slate-400 font-medium text-xs mt-0.5">Live events streaming from runtime ledger</p>
                            </div>
                            <button 
                                onClick={() => onNavigateTab?.('logs')}
                                className="text-xs sm:text-sm font-bold text-blue-600 hover:text-blue-750 hover:underline"
                            >
                                View all logs &rarr;
                            </button>
                        </div>

                        <div className="flex flex-col gap-4">
                            {RECENT_ACTIVITIES.map((activity) => (
                                <div key={activity.id} className="flex gap-4 items-start select-none border-b border-slate-50 pb-3 last:border-b-0 last:pb-0">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                                        activity.type === 'success' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-650'
                                    }`}>
                                        {activity.type === 'success' ? (
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                        ) : (
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex justify-between items-baseline gap-2">
                                            <h4 className="font-bold text-slate-800 text-xs sm:text-sm">{activity.action}</h4>
                                            <div className="flex items-center gap-2 shrink-0 text-xs text-slate-400 font-medium">
                                                <span>{activity.latency}</span>
                                                <span className="text-slate-300">•</span>
                                                <span>{activity.time}</span>
                                            </div>
                                        </div>
                                        <p className="text-xs sm:text-sm text-slate-500 font-medium mt-1 leading-normal truncate">{activity.detail}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
};

export default DashboardTab;
