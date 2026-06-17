import React, { useState, useMemo } from 'react';

const LOGS_DATA = [
    { 
        id: 'run-8b7a9f2d', 
        time: '2026-06-17 15:30:00', 
        workflow: 'Sales Lead Sync', 
        duration: '422ms', 
        status: 'Success',
        trigger: 'Stripe Webhook',
        tags: ['Stripe', 'OpenAI', 'Slack'],
        steps: [
            { name: 'Stripe Payment Webhook', type: 'trigger', status: 'success', time: '12ms', details: 'Event: invoice.payment_succeeded. Customer: lim@gmail.com' },
            { name: 'Extract Sentiment & Details', type: 'ai', status: 'success', time: '340ms', details: 'Model: prompty-ultra-v3. Intent: Upgrade subscription' },
            { name: 'Post Slack Notification', type: 'action', status: 'success', time: '70ms', details: 'Posted message to #sales-leads. Msg ID: sl-8802' }
        ]
    },
    { 
        id: 'run-7c6d5e4b', 
        time: '2026-06-17 15:15:22', 
        workflow: 'Auto-invoice PDF Generator', 
        duration: '1.5s', 
        status: 'Success',
        trigger: 'Weekly Schedule',
        tags: ['Cron', 'Postgres', 'Resend'],
        steps: [
            { name: 'Weekly Schedule Trigger', type: 'trigger', status: 'success', time: '1ms', details: 'Cron expression: 0 0 * * FRI' },
            { name: 'Fetch Postgres Customers', type: 'action', status: 'success', time: '210ms', details: 'Returned 42 active unpaid accounts' },
            { name: 'Batch SMTP Invoice Mails', type: 'action', status: 'success', time: '1.29s', details: 'Dispatched 42 PDF files via Resend SMTP server' }
        ]
    },
    { 
        id: 'run-6a5b4c3d', 
        time: '2026-06-17 14:02:10', 
        workflow: 'Support Ticket Automation', 
        duration: '1.2s', 
        status: 'Success',
        trigger: 'Support Email Intake',
        tags: ['Gmail', 'OpenAI', 'Jira'],
        steps: [
            { name: 'Email Received Inbox', type: 'trigger', status: 'success', time: '5ms', details: 'From: client@support.com. Subject: API downtime' },
            { name: 'AI Urgent Sentiment Filter', type: 'ai', status: 'success', time: '820ms', details: 'Model: prompty-fast-v3. Result: Critical Urgency' },
            { name: 'Create Jira Service Ticket', type: 'action', status: 'success', time: '375ms', details: 'Ticket created: SRV-102. Assigned to dev-ops' }
        ]
    },
    { 
        id: 'run-5f4e3d2c', 
        time: '2026-06-17 12:45:00', 
        workflow: 'Weekly Analytics Engine', 
        duration: '12.4s', 
        status: 'Failed',
        trigger: 'Weekly Schedule',
        tags: ['Cron', 'Postgres', 'Slack'],
        error: 'PostgreSQL Connection Timeout (ERR_CONN_TIMEOUT)',
        steps: [
            { name: 'Weekly Schedule Trigger', type: 'trigger', status: 'success', time: '2ms', details: 'Cron expression: 0 17 * * FRI' },
            { name: 'Fetch Database Metrics', type: 'action', status: 'failed', time: '12.4s', details: 'TCP Connection timed out on port 5432. Server failed to respond.' },
            { name: 'Slack Summary Report', type: 'action', status: 'skipped', time: '0ms', details: 'Skipped due to upstream node execution failure.' }
        ]
    },
    { 
        id: 'run-4c3b2a10', 
        time: '2026-06-17 09:30:00', 
        workflow: 'Sales Lead Sync', 
        duration: '390ms', 
        status: 'Success',
        trigger: 'Stripe Webhook',
        tags: ['Stripe', 'OpenAI', 'Slack'],
        steps: [
            { name: 'Stripe Payment Webhook', type: 'trigger', status: 'success', time: '10ms', details: 'Event: invoice.payment_succeeded. Customer: tan@sales.co' },
            { name: 'Extract Sentiment & Details', type: 'ai', status: 'success', time: '310ms', details: 'Model: prompty-ultra-v3. Intent: Consultation setup' },
            { name: 'Post Slack Notification', type: 'action', status: 'success', time: '70ms', details: 'Posted message to #sales-leads. Msg ID: sl-8801' }
        ]
    }
];

const LogsTab = () => {
    const [selectedLog, setSelectedLog] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('All'); // 'All' | 'Success' | 'Failed'

    // Filter logs
    const filteredLogs = useMemo(() => {
        return LOGS_DATA.filter(log => {
            const matchesSearch = log.workflow.toLowerCase().includes(searchQuery.toLowerCase()) || log.id.toLowerCase().includes(searchQuery.toLowerCase());
            const matchesStatus = statusFilter === 'All' || log.status === statusFilter;
            return matchesSearch && matchesStatus;
        });
    }, [searchQuery, statusFilter]);

    return (
        <div className="flex-1 flex overflow-hidden bg-slate-50/50 font-sans h-full animate-fade-in">
            
            {/* Logs List Pane */}
            <div className={`flex-1 p-6 md:p-8 overflow-y-auto flex flex-col gap-6 ${selectedLog ? 'hidden lg:flex lg:w-1/2' : 'w-full'}`}>
                <div className="max-w-4xl mx-auto w-full flex flex-col gap-5">
                    {/* Header */}
                    <div>
                        <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Execution logs console</h2>
                        <p className="text-slate-500 font-medium text-xs sm:text-sm mt-1">Inspect live logs, latency times, and nodes execution paths.</p>
                    </div>

                    {/* Filter and Search Bar */}
                    <div className="flex flex-col sm:flex-row gap-3 items-center justify-between bg-white border border-slate-200 p-3 rounded-2xl shadow-sm">
                        <div className="relative w-full sm:w-72">
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search by run ID or workflow name..."
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-3 py-2 text-xs sm:text-sm font-semibold text-slate-800 placeholder:text-slate-400 outline-none focus:border-blue-400 transition-all shadow-inner"
                            />
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="absolute left-2.5 top-3 text-slate-400"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                        </div>

                        <div className="flex gap-1.5 self-end sm:self-auto select-none">
                            {['All', 'Success', 'Failed'].map(status => (
                                <button
                                    key={status}
                                    onClick={() => setStatusFilter(status)}
                                    className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-bold transition-all border ${
                                        statusFilter === status
                                            ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                                            : 'bg-white text-slate-650 border-slate-200 hover:bg-slate-50'
                                    }`}
                                >
                                    {status}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Developer Log Console List */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                        {filteredLogs.length === 0 ? (
                            <div className="p-12 text-center text-slate-500 font-semibold text-sm">
                                No logs found matching query filters.
                            </div>
                        ) : (
                            filteredLogs.map(log => (
                                <div
                                    key={log.id}
                                    onClick={() => setSelectedLog(log)}
                                    className={`p-4 flex items-center justify-between gap-4 cursor-pointer hover:bg-slate-50/50 transition-colors select-none border-t border-slate-100 first:border-t-0 ${
                                        selectedLog?.id === log.id ? 'bg-blue-50/20 border-l-4 border-l-blue-600' : 'border-l-4 border-l-transparent'
                                    }`}
                                >
                                    <div className="flex flex-col gap-1.5 min-w-0 flex-1">
                                        <div className="flex items-center gap-3">
                                            <span className="font-extrabold text-slate-900 text-sm sm:text-base truncate">{log.workflow}</span>
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wide border ${
                                                log.status === 'Success' 
                                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-105 border-emerald-200' 
                                                    : 'bg-red-50 text-red-700 border-red-200'
                                            }`}>
                                                {log.status}
                                            </span>
                                        </div>
                                        
                                        <div className="flex items-center gap-2 flex-wrap text-xs font-bold text-slate-400">
                                            <span className="font-mono text-slate-500 shrink-0">{log.id}</span>
                                            <span>•</span>
                                            <span>{log.trigger}</span>
                                            <span>•</span>
                                            <span className="text-slate-500 shrink-0">{log.time}</span>
                                        </div>

                                        {/* Error Alert Tag */}
                                        {log.error && (
                                            <div className="text-xs font-bold text-red-650 bg-red-50/50 border border-red-100 rounded-md py-1.5 px-3.5 mt-1.5 leading-relaxed truncate">
                                                {log.error}
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex flex-col items-end gap-1.5 shrink-0 select-none">
                                        <span className="text-xs sm:text-sm font-bold text-slate-800">{log.duration}</span>
                                        <div className="flex gap-1">
                                            {log.tags.map(tag => (
                                                <span key={tag} className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-150">
                                                    {tag}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            {/* Right Pane: Visual Debugger Drawer */}
            {selectedLog && (
                <div className="w-full lg:w-[420px] border-l border-slate-200 bg-white h-full flex flex-col shrink-0 animate-in slide-in-from-right duration-250 shadow-2xl z-10">
                    {/* Drawer Header */}
                    <div className="p-4 border-b border-slate-150 flex items-center justify-between bg-slate-50/50 shrink-0">
                        <div>
                            <h3 className="font-extrabold text-slate-800 text-sm sm:text-base">Execution Inspector</h3>
                            <span className="font-mono text-xs text-slate-500">{selectedLog.id}</span>
                        </div>
                        <button 
                            onClick={() => setSelectedLog(null)} 
                            className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-400 hover:text-slate-700 transition-colors"
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                    </div>

                    {/* Drawer Body */}
                    <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-6">
                        
                        {/* Summary Details */}
                        <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-150 text-xs sm:text-sm">
                            <div className="flex flex-col gap-0.5">
                                <span className="font-bold text-slate-400 text-xs uppercase">Duration</span>
                                <span className="font-extrabold text-slate-850 text-slate-800">{selectedLog.duration}</span>
                            </div>
                            <div className="flex flex-col gap-0.5">
                                <span className="font-bold text-slate-400 text-xs uppercase">Outcome</span>
                                <span className={`font-extrabold ${selectedLog.status === 'Success' ? 'text-emerald-600' : 'text-red-700'}`}>
                                    {selectedLog.status}
                                </span>
                            </div>
                        </div>

                        {/* Step-by-Step Flow Path Visualizer */}
                        <div className="flex flex-col gap-3">
                            <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Execution Path Debugger</span>
                            
                            <div className="flex flex-col pl-4 relative border-l border-slate-150 ml-1.5 gap-5">
                                {selectedLog.steps.map((step, idx) => {
                                    const isSuccess = step.status === 'success';
                                    const isFailed = step.status === 'failed';
                                    const isSkipped = step.status === 'skipped';

                                    let badgeBg = 'bg-slate-100 text-slate-400 ring-slate-150';
                                    if (isSuccess) badgeBg = 'bg-emerald-50 text-emerald-650 ring-emerald-100';
                                    if (isFailed) badgeBg = 'bg-red-50 text-red-700 ring-red-100';

                                    return (
                                        <div key={idx} className="relative flex flex-col gap-1">
                                            {/* Node icon node bubble */}
                                            <div className={`absolute -left-[24px] top-0 w-[18px] h-[18px] rounded-full ring-2 ${badgeBg} flex items-center justify-center font-bold text-[9px] z-10 bg-white`}>
                                                {isSuccess && '✓'}
                                                {isFailed && '✗'}
                                                {isSkipped && '○'}
                                            </div>

                                            <div className="flex items-center justify-between pl-2 select-none">
                                                <span className={`text-xs sm:text-sm font-extrabold ${isSkipped ? 'text-slate-400' : 'text-slate-800'}`}>{step.name}</span>
                                                <span className="text-[10px] font-bold text-slate-400">{step.time}</span>
                                            </div>
                                            <p className="text-xs font-medium text-slate-500 pl-2 leading-relaxed break-words">{step.details}</p>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Input/Output Payload Debug Block */}
                        <div className="flex flex-col gap-2.5">
                            <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Raw Input Payload</span>
                            <div className="bg-slate-900 border border-slate-800 text-indigo-150 p-4 rounded-2xl text-xs font-mono shadow-inner overflow-x-auto select-all leading-relaxed">
                                <pre>{JSON.stringify({
                                    event: selectedLog.trigger,
                                    time: selectedLog.time,
                                    runId: selectedLog.id,
                                    context: {
                                        environment: 'production',
                                        version: '1.0.2',
                                        retries: 0
                                    }
                                }, null, 2)}</pre>
                            </div>
                        </div>

                    </div>
                </div>
            )}
        </div>
    );
};

export default LogsTab;
