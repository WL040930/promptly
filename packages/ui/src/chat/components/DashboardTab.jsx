import React from 'react';

const DashboardTab = () => {
    const stats = [
        { label: 'Jobs Completed', value: '1,248', trend: '+12% this week', color: 'text-emerald-600', bg: 'bg-emerald-50' },
        { label: 'Success Rate', value: '99.4%', trend: 'Stable', color: 'text-blue-600', bg: 'bg-blue-50' },
        { label: 'Active Workflows', value: '8', trend: '+2 new', color: 'text-indigo-600', bg: 'bg-indigo-50' },
        { label: 'Time Saved', value: '42.5 hrs', trend: 'This month', color: 'text-purple-600', bg: 'bg-purple-50' }
    ];

    const recentActivity = [
        { id: 1, title: 'Sales Lead Sync completed successfully', time: '2 mins ago', status: 'success' },
        { id: 2, title: 'Auto-invoice PDF generated', time: '15 mins ago', status: 'success' },
        { id: 3, title: 'Slack notification sent to #sales', time: '1 hr ago', status: 'success' },
        { id: 4, title: 'Weekly Report failed to fetch data', time: '3 hrs ago', status: 'error' }
    ];

    return (
        <div className="flex-1 overflow-y-auto bg-slate-50/50 font-sans p-6 md:p-8">
            <div className="max-w-6xl mx-auto flex flex-col gap-8">
                {/* Welcome Banner */}
                <div className="w-full rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 p-8 text-white shadow-lg relative overflow-hidden">
                    <div className="relative z-10">
                        <h2 className="text-3xl font-extrabold mb-2 tracking-tight">Welcome back!</h2>
                    <p className="text-blue-100 text-lg max-w-xl">Your automations are running smoothly. You have saved 42.5 hours this month.</p>
                </div>
                <div className="absolute top-[-20%] right-[-5%] w-64 h-64 bg-white/10 rounded-full blur-3xl"></div>
            </div>

            {/* Stats Grid */}
            <div>
                <h3 className="text-base font-semibold text-slate-900 tracking-tight mb-4">Overview</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {stats.map((stat, i) => (
                        <div key={i} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                            <div className="text-xs font-semibold text-slate-500 mb-1">{stat.label}</div>
                            <div className="text-2xl font-semibold text-slate-800 mb-2">{stat.value}</div>
                            <div className={`text-[11px] font-medium px-2 py-0.5 inline-block rounded-md border ${stat.bg} ${stat.color}`}>
                                {stat.trend}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Recent Activity */}
            <div>
                <h3 className="text-base font-semibold text-slate-900 tracking-tight mb-4">Recent Executions</h3>
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="flex flex-col">
                        {recentActivity.map((activity, i) => (
                            <div key={activity.id} className={`flex items-center gap-4 p-4 ${i !== recentActivity.length - 1 ? 'border-b border-slate-100' : ''} hover:bg-slate-50 transition-colors`}>
                                <div className={`w-2 h-2 rounded-full shrink-0 ${activity.status === 'success' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]'}`}></div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-slate-700 truncate">{activity.title}</p>
                                </div>
                                <div className="text-xs font-medium text-slate-400 shrink-0">
                                    {activity.time}
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
