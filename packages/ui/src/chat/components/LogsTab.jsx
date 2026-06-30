import React, { useState, useEffect, useMemo, useRef } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { getExecutionLogs } from '../../api/backend.js';

const LogsTab = () => {
    const [selectedLog, setSelectedLog] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('All'); // 'All' | 'Success' | 'Failed'
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const container = useRef(null);

    useGSAP(() => {
        gsap.from(container.current, { opacity: 0, y: 15, duration: 0.3, ease: 'power2.out' });
    }, { scope: container });

    useEffect(() => {
        setLoading(true);
        // Debounce simple fetch for now
        const timer = setTimeout(() => {
            getExecutionLogs(searchQuery, statusFilter).then(data => {
                setLogs(data);
                setLoading(false);
            }).catch(err => {
                console.error(err);
                setLoading(false);
            });
        }, 300);
        return () => clearTimeout(timer);
    }, [searchQuery, statusFilter]);

    // Format for UI rendering
    const filteredLogs = useMemo(() => {
        return logs.map(log => ({
            id: log.id,
            time: new Date(log.time).toLocaleString(),
            workflow: log.workflowId, // Real app would join workflow name here
            duration: log.durationMs ? `${log.durationMs}ms` : 'N/A',
            status: log.status,
            trigger: log.trigger,
            tags: log.tags || [],
            steps: log.steps || [],
            error: log.error
        }));
    }, [logs]);

    return (
        <div ref={container} className="tab-content flex-1 flex overflow-hidden bg-slate-50/50 font-sans h-full">
            
            {/* Logs List Pane */}
            <div className={`flex-1 p-6 md:p-8 overflow-y-auto flex flex-col gap-8 ${selectedLog ? 'hidden lg:flex lg:w-1/2' : 'w-full'}`}>
                <div className="max-w-6xl mx-auto w-full flex flex-col gap-8">
                    {/* Header */}
                    <div>
                        <h2 className="text-2xl font-semibold text-slate-900 tracking-tight">Execution Logs</h2>
                        <p className="text-sm text-slate-500 mt-1">Inspect live logs, latency times, and node execution paths.</p>
                    </div>

                    {/* Filter and Search Bar */}
                    <div className="flex flex-col sm:flex-row gap-3 items-center justify-between bg-white border border-slate-200 p-3 rounded-2xl shadow-sm">
                        <div className="relative w-full sm:w-72">
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search by run ID or workflow name..."
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-3 py-2 text-sm font-medium text-slate-800 placeholder:text-slate-400 outline-none focus:border-indigo-400 transition-all shadow-inner"
                            />
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="absolute left-2.5 top-3 text-slate-400"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                        </div>

                        <div className="flex gap-1.5 self-end sm:self-auto select-none">
                            {['All', 'Success', 'Failed'].map(status => (
                                <button
                                    key={status}
                                    onClick={() => setStatusFilter(status)}
                                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all border ${
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
                    {filteredLogs.length === 0 ? (
                        <div className="p-12 text-center border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center bg-white/50">
                            <div className="w-16 h-16 bg-slate-50 text-slate-400 rounded-full flex items-center justify-center mb-4">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
                                </svg>
                            </div>
                            <div className="text-slate-600 font-semibold mb-1">No logs found</div>
                            <div className="text-slate-400 text-sm">No logs match your current filters.</div>
                        </div>
                    ) : (
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                            {filteredLogs.map(log => (
                                <div
                                    key={log.id}
                                    onClick={() => setSelectedLog(log)}
                                    className={`p-4 flex items-center justify-between gap-4 cursor-pointer hover:bg-slate-50/50 transition-colors select-none border-t border-slate-100 first:border-t-0 ${
                                        selectedLog?.id === log.id ? 'bg-indigo-50/20 border-l-4 border-l-blue-600' : 'border-l-4 border-l-transparent'
                                    }`}
                                >
                                    <div className="flex flex-col gap-1.5 min-w-0 flex-1">
                                        <div className="flex items-center gap-3">
                                            <span className="font-semibold text-slate-900 text-sm sm:text-base truncate">{log.workflow}</span>
                                            <span className={`px-2 py-0.5 rounded text-xs font-medium border ${
                                                log.status === 'Success' 
                                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-105 border-emerald-200' 
                                                    : 'bg-red-50 text-red-700 border-red-200'
                                            }`}>
                                                {log.status}
                                            </span>
                                        </div>
                                        
                                        <div className="flex items-center gap-2 flex-wrap text-xs font-medium text-slate-500">
                                            <span className="font-mono text-slate-500 shrink-0">{log.id}</span>
                                            <span>•</span>
                                            <span>{log.trigger}</span>
                                            <span>•</span>
                                            <span className="text-slate-500 shrink-0">{log.time}</span>
                                        </div>

                                        {/* Error Alert Tag */}
                                        {log.error && (
                                            <div className="text-xs font-medium text-red-600 bg-red-50/50 border border-red-100 rounded-lg py-1.5 px-3 mt-1.5 leading-relaxed truncate">
                                                {log.error}
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex flex-col items-end gap-1.5 shrink-0 select-none">
                                        <span className="text-xs sm:text-sm font-medium text-slate-800">{log.duration}</span>
                                        <div className="flex gap-1">
                                            {log.tags.map(tag => (
                                                <span key={tag} className="text-xs font-medium text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                                                    {tag}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Right Pane: Visual Debugger Drawer */}
            {selectedLog && (
                <div className="w-full lg:w-[420px] border-l border-slate-200 bg-white h-full flex flex-col shrink-0 animate-in slide-in-from-right duration-250 shadow-2xl z-10">
                    {/* Drawer Header */}
                    <div className="p-4 border-b border-slate-150 flex items-center justify-between bg-slate-50/50 shrink-0">
                        <div>
                            <h3 className="font-semibold text-slate-900 text-sm sm:text-base">Execution Inspector</h3>
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
                                <span className="font-medium text-slate-500 text-xs">Duration</span>
                                <span className="font-semibold text-slate-850 text-slate-800">{selectedLog.duration}</span>
                            </div>
                            <div className="flex flex-col gap-0.5">
                                <span className="font-medium text-slate-500 text-xs">Outcome</span>
                                <span className={`font-semibold ${selectedLog.status === 'Success' ? 'text-emerald-600' : 'text-red-700'}`}>
                                    {selectedLog.status}
                                </span>
                            </div>
                        </div>

                        {/* Step-by-Step Flow Path Visualizer */}
                        <div className="flex flex-col gap-3">
                            <span className="text-xs font-semibold text-slate-500">Execution Path Debugger</span>
                            
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
                                            <div className={`absolute -left-[24px] top-0 w-[18px] h-[18px] rounded-full ring-2 ${badgeBg} flex items-center justify-center font-medium text-[9px] z-10 bg-white`}>
                                                {isSuccess && '✓'}
                                                {isFailed && '✗'}
                                                {isSkipped && '○'}
                                            </div>

                                            <div className="flex items-center justify-between pl-2 select-none">
                                                <span className={`text-xs sm:text-sm font-medium ${isSkipped ? 'text-slate-400' : 'text-slate-800'}`}>{step.name}</span>
                                                <span className="text-xs font-medium text-slate-400">{step.time}</span>
                                            </div>
                                            <p className="text-xs font-medium text-slate-500 pl-2 leading-relaxed break-words">{step.details}</p>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Input/Output Payload Debug Block */}
                        <div className="flex flex-col gap-2.5">
                            <span className="text-xs font-semibold text-slate-500">Raw Input Payload</span>
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
