import React, { useMemo, useRef } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { useDashboardMetrics } from '../../../api/hooks/useDashboard.js';
import Skeleton from '../../../components/ui/Skeleton.jsx';
import { navigateTo } from '../../../utils/router.js';

const SKELETON_BAR_HEIGHTS = [36, 58, 44, 72, 52, 66, 48];

const KPI_CARDS = [
    {
        label: 'Active Automations',
        valueKey: 'activeWorkflowCount',
        subtitle: 'Currently enabled automations',
        accentColor: 'from-indigo-500 to-indigo-500',
        icon: (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
                <polyline points="2 17 12 22 22 17"></polyline>
                <polyline points="2 12 12 17 22 12"></polyline>
            </svg>
        )
    },
    {
        label: 'Avg Success Rate',
        valueKey: 'successRate',
        subtitle: 'Across all recorded executions',
        accentColor: 'from-emerald-500 to-teal-500',
        icon: (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
        )
    },
    {
        label: 'Total Run Volume',
        valueKey: 'totalRuns',
        subtitle: 'All recorded executions',
        accentColor: 'from-orange-500 to-amber-500',
        icon: (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="20" x2="18" y2="10"></line>
                <line x1="12" y1="20" x2="12" y2="4"></line>
                <line x1="6" y1="20" x2="6" y2="14"></line>
            </svg>
        )
    }
];

const DashboardTab = ({ activeWorkflowCount, onNavigateTab, compact = false }) => {
    const { data, isLoading: loading } = useDashboardMetrics();
    
    const metrics = useMemo(() => ({
        activeWorkflowCount: activeWorkflowCount || data?.activeWorkflowCount || 0,
        totalRuns: data?.totalRuns || 0,
        successRate: data?.successRate || '—',
        weeklyData: data?.weeklyData || [],
        recentActivities: data?.recentActivities || []
    }), [data, activeWorkflowCount]);

    const go = page => {
        if (onNavigateTab) return onNavigateTab(page);
        if (page === 'workflows') navigateTo({ page: 'automations' });
        else if (page === 'forms') navigateTo({ page: 'forms' });
        else if (page === 'logs') navigateTo({ page: 'runs' });
    };

    const systemStatus = useMemo(() => {
        if (loading) return { label: 'Checking recent activity', className: 'bg-slate-50 text-slate-600 border-slate-200' };
        if (metrics.recentActivities.some(activity => activity.type === 'error')) {
            return { label: 'Needs attention', className: 'bg-amber-50 text-amber-700 border-amber-200' };
        }
        return {
            label: metrics.recentActivities.length > 0 ? 'No recent failures' : 'No runs yet',
            className: 'bg-emerald-50 text-emerald-700 border-emerald-200'
        };
    }, [loading, metrics.recentActivities]);

    const maxRuns = useMemo(() => Math.max(1, ...metrics.weeklyData.map(d => d.runs)), [metrics.weeklyData]);
    const container = useRef(null);

    useGSAP(() => {
        gsap.from(container.current, { opacity: 0, y: 15, duration: 0.3, ease: 'power2.out' });
    }, { scope: container });



    return (
        <div ref={container} className="tab-content flex-1 overflow-y-auto bg-slate-50 font-sans p-6 md:p-8">
            <div className="max-w-6xl mx-auto flex flex-col gap-8">

                {/* ─── Section 1: Page Header ─── */}
                <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Home</h1>
                        <p className="text-sm text-slate-500 mt-1">
                            Overview of your automation workspace health and activity.
                        </p>
                    </div>
                    <div className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl border shadow-sm ${systemStatus.className}`}>
                        <span className="w-2 h-2 rounded-full bg-current"></span>
                        <span className="text-sm font-medium">{systemStatus.label}</span>
                    </div>
                </div>

                {/* ─── Section 2: KPI Metric Cards ─── */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {KPI_CARDS.map((kpi, i) => (
                        <div key={i} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                            {/* Colored accent bar */}
                            <div className={`h-1 bg-gradient-to-r ${kpi.accentColor}`}></div>
                            <div className="p-5">
                                <div className="flex items-center justify-between mb-4">
                                    <span className="text-xs font-medium text-slate-500">{kpi.label}</span>
                                    <span className="w-8 h-8 rounded-lg bg-slate-50 text-slate-400 flex items-center justify-center">
                                        {kpi.icon}
                                    </span>
                                </div>
                                <div className="flex items-baseline gap-2.5">
                                    {loading ? (
                                        <Skeleton className="h-9 w-20 rounded-md mt-1" />
                                    ) : (
                                        <>
                                            <span className="text-3xl font-semibold text-slate-900 tracking-tight">
                                                {metrics[kpi.valueKey] || 0}
                                            </span>
                                        </>
                                    )}
                                </div>
                                <p className="text-xs text-slate-400 mt-2.5">{kpi.subtitle}</p>
                            </div>
                        </div>
                    ))}
                </div>

                {/* ─── Section 3: Chart + Quick Actions ─── */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

                    {/* Bar Chart */}
                    <div className={`${compact ? 'lg:col-span-3' : 'lg:col-span-2'} bg-white border border-slate-200 rounded-2xl p-6 shadow-sm`}>
                        <div className="flex items-center justify-between mb-6">
                            <div>
                            <h2 className="text-base font-semibold text-slate-900">Run volume</h2>
                                <p className="text-xs text-slate-400 mt-0.5">Automation runs per day this week</p>
                            </div>
                            <span className="text-xs font-medium text-slate-500 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
                                Past 7 Days
                            </span>
                        </div>

                        <div className="w-full h-[180px] flex items-stretch gap-3 px-1">
                            {loading ? (
                                Array.from({ length: 7 }).map((_, i) => (
                                    <div key={i} className="flex-1 h-full min-h-0 flex flex-col items-center gap-2">
                                        <div className="flex-1 min-h-0 w-full max-w-[40px] flex items-end">
                                            <Skeleton className="w-full rounded-lg" style={{ height: `${SKELETON_BAR_HEIGHTS[i]}%` }} />
                                        </div>
                                        <Skeleton className="h-3 w-6 rounded" />
                                    </div>
                                ))
                            ) : metrics.weeklyData.map((data, index) => {
                                const heightPct = (data.runs / maxRuns) * 100;
                                const isHighest = data.runs === maxRuns;
                                return (
                                    <div key={index} className="flex-1 h-full min-h-0 flex flex-col items-center gap-2 group relative">
                                        {/* Tooltip */}
                                        <div className="opacity-0 group-hover:opacity-100 absolute -top-8 bg-slate-800 text-white text-[11px] font-medium px-2.5 py-1 rounded-lg shadow-lg transition-opacity pointer-events-none z-10 whitespace-nowrap">
                                            {data.runs} runs
                                        </div>
                                        {/* Bar */}
                                        <div className="flex-1 min-h-0 w-full max-w-[40px] flex items-end">
                                            <div
                                                className={`w-full rounded-lg transition-all duration-300 ${
                                                    isHighest
                                                        ? 'bg-indigo-500 group-hover:bg-indigo-600'
                                                        : 'bg-indigo-200 group-hover:bg-indigo-400'
                                                }`}
                                                style={{ height: `${Math.max(heightPct, 6)}%`, minHeight: '16px' }}
                                            />
                                        </div>
                                        {/* Label */}
                                        <span className="text-[11px] font-medium text-slate-400">{data.day}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Quick Actions */}
                    {!compact && (
                    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col">
                        <div className="mb-5">
                            <h2 className="text-base font-semibold text-slate-900">Quick Actions</h2>
                            <p className="text-xs text-slate-400 mt-0.5">Jump into building workflows</p>
                        </div>
                        <div className="flex flex-col gap-3 flex-1 justify-center">
                            <button
                                onClick={() => go('workflows')}
                                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm py-3 px-4 rounded-xl shadow-sm hover:shadow active:scale-[0.98] transition-all flex items-center justify-center gap-2.5"
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
                                </svg>
                                Create Automation Flow
                            </button>
                            <button
                                onClick={() => go('forms')}
                                className="w-full bg-slate-900 hover:bg-slate-800 text-white font-medium text-sm py-3 px-4 rounded-xl shadow-sm hover:shadow active:scale-[0.98] transition-all flex items-center justify-center gap-2.5"
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                                    <line x1="3" y1="9" x2="21" y2="9"></line>
                                    <line x1="9" y1="21" x2="9" y2="9"></line>
                                </svg>
                                Design Intake Form
                            </button>
                            <button
                                onClick={() => go('logs')}
                                className="w-full bg-white hover:bg-slate-50 text-slate-700 font-medium text-sm py-3 px-4 rounded-xl border border-slate-200 shadow-sm hover:shadow active:scale-[0.98] transition-all flex items-center justify-center gap-2.5"
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                    <polyline points="14 2 14 8 20 8"></polyline>
                                    <line x1="16" y1="13" x2="8" y2="13"></line>
                                    <line x1="16" y1="17" x2="8" y2="17"></line>
                                </svg>
                                View runs
                            </button>
                        </div>
                    </div>
                    )}
                </div>

                {/* ─── Section 4: Integrations + Activity Feed ─── */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

                    {/* Activity Feed */}
                    <div className="lg:col-span-3 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                        <div className="flex items-center justify-between mb-5">
                            <div>
                                <h2 className="text-base font-semibold text-slate-900">Recent Activity</h2>
                                <p className="text-xs text-slate-400 mt-0.5">Latest workflow executions and events</p>
                            </div>
                            <button
                                onClick={() => go('logs')}
                                className="text-sm font-medium text-indigo-600 hover:text-indigo-700 hover:underline transition-colors"
                            >
                                View all &rarr;
                            </button>
                        </div>

                        <div className="flex flex-col">
                            {loading ? (
                                Array.from({ length: 4 }).map((_, i) => (
                                    <div key={i} className={`flex gap-4 items-start py-3.5 ${i < 3 ? 'border-b border-slate-100' : ''}`}>
                                        <Skeleton className="w-8 h-8 rounded-lg shrink-0" />
                                        <div className="flex-1 space-y-2 mt-1">
                                            <Skeleton className="h-4 rounded w-1/3" />
                                            <Skeleton className="h-3 rounded w-2/3" />
                                        </div>
                                    </div>
                                ))
                            ) : metrics.recentActivities && metrics.recentActivities.length > 0 ? (
                                metrics.recentActivities.map((activity, index) => (
                                    <div key={activity.id} className={`flex gap-4 items-start py-3.5 ${
                                        index < metrics.recentActivities.length - 1 ? 'border-b border-slate-100' : ''
                                    }`}>
                                        {/* Status icon */}
                                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                                            activity.type === 'success'
                                                ? 'bg-emerald-50 text-emerald-500'
                                                : 'bg-red-50 text-red-500'
                                        }`}>
                                            {activity.type === 'success' ? (
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                            ) : (
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
                                            )}
                                        </div>

                                        {/* Content */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-baseline justify-between gap-3">
                                                <h4 className="text-sm font-medium text-slate-800">{activity.action}</h4>
                                                <div className="flex items-center gap-2 shrink-0 text-xs text-slate-400">
                                                    <span className="font-mono text-[11px]">{activity.latency}</span>
                                                    <span className="text-slate-200">·</span>
                                                    <span>{activity.time}</span>
                                                </div>
                                            </div>
                                            <p className="text-xs text-slate-400 mt-1 leading-relaxed truncate">{activity.detail}</p>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
                                    <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 mb-3 border border-slate-100 shadow-sm">
                                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                            <circle cx="12" cy="12" r="10"></circle>
                                            <polyline points="12 6 12 12 16 14"></polyline>
                                        </svg>
                                    </div>
                                    <h4 className="text-sm font-medium text-slate-800">No recent activity</h4>
                                    <p className="text-xs text-slate-400 mt-1">Your workflow executions will appear here.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
};

export default DashboardTab;
