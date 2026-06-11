import React, { useState } from 'react';

const LOGS = [
    { id: 'ex_1', time: '2026-06-04 15:30:00', workflow: 'Sales Lead Sync', duration: '1.2s', status: 'Success' },
    { id: 'ex_2', time: '2026-06-04 15:15:22', workflow: 'Auto-invoice PDF Generator', duration: '4.5s', status: 'Success' },
    { id: 'ex_3', time: '2026-06-04 14:02:10', workflow: 'Slack Notification Setup', duration: '0.8s', status: 'Success' },
    { id: 'ex_4', time: '2026-06-04 12:45:00', workflow: 'Weekly Report Fetch', duration: '12.4s', status: 'Failed' },
    { id: 'ex_5', time: '2026-06-04 09:30:00', workflow: 'Sales Lead Sync', duration: '1.1s', status: 'Success' },
];

const LogsTab = () => {
    const [selectedLog, setSelectedLog] = useState(null);

    return (
        <div className="flex-1 flex overflow-hidden animate-fade-in bg-slate-50/50">
            {/* Logs List Area */}
            <div className={`flex-1 p-8 overflow-y-auto ${selectedLog ? 'hidden lg:block lg:w-1/2' : 'w-full'}`}>
                <div className="max-w-4xl mx-auto">
                    <div className="mb-6">
                        <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Execution Logs</h2>
                        <p className="text-sm text-slate-500 mt-1">Review historical runs of your automated workflows.</p>
                    </div>

                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-xs">
                                <tr>
                                    <th className="px-6 py-4">Timestamp</th>
                                    <th className="px-6 py-4">Workflow</th>
                                    <th className="px-6 py-4">Duration</th>
                                    <th className="px-6 py-4">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {LOGS.map(log => (
                                    <tr 
                                        key={log.id} 
                                        onClick={() => setSelectedLog(log)}
                                        className={`cursor-pointer hover:bg-slate-50 transition-colors ${selectedLog?.id === log.id ? 'bg-blue-50/50' : ''}`}
                                    >
                                        <td className="px-6 py-4 font-medium text-slate-700 whitespace-nowrap">{log.time}</td>
                                        <td className="px-6 py-4 font-bold text-slate-900">{log.workflow}</td>
                                        <td className="px-6 py-4 text-slate-500">{log.duration}</td>
                                        <td className="px-6 py-4">
                                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold border ${
                                                log.status === 'Success' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'
                                            }`}>
                                                <div className={`w-1.5 h-1.5 rounded-full ${log.status === 'Success' ? 'bg-emerald-500' : 'bg-red-500'}`}></div>
                                                {log.status}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Log Details Sidebar Panel */}
            {selectedLog && (
                <div className="w-full lg:w-[400px] border-l border-slate-200 bg-white h-full flex flex-col shrink-0 animate-fade-in shadow-[-10px_0_30px_rgba(0,0,0,0.02)] z-10">
                    <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/30">
                        <h3 className="font-extrabold text-slate-800">Log Details</h3>
                        <button onClick={() => setSelectedLog(null)} className="p-2 hover:bg-slate-200 rounded-lg text-slate-400 hover:text-slate-700 transition-colors">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                    </div>
                    <div className="p-6 flex-1 overflow-y-auto">
                        <div className="mb-6 flex flex-col gap-1">
                            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Execution ID</span>
                            <span className="font-mono text-sm text-slate-800">{selectedLog.id}</span>
                        </div>
                        <div className="mb-6 flex flex-col gap-1">
                            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Workflow</span>
                            <span className="font-bold text-slate-900">{selectedLog.workflow}</span>
                        </div>
                        <div className="mb-6 flex flex-col gap-1">
                            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Status</span>
                            <span className={`inline-block font-bold ${selectedLog.status === 'Success' ? 'text-emerald-600' : 'text-red-600'}`}>{selectedLog.status}</span>
                        </div>
                        <div className="flex flex-col gap-2">
                            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Payload View</span>
                            <div className="bg-[#0f172a] text-slate-300 p-4 rounded-xl text-xs font-mono overflow-x-auto border border-slate-800 shadow-inner">
                                <pre>
{`{
  "event": "trigger",
  "timestamp": "${selectedLog.time}",
  "params": {
    "source": "webhook",
    "retries": 0
  },
  "result": {
    "code": ${selectedLog.status === 'Success' ? 200 : 500},
    "message": "${selectedLog.status === 'Success' ? 'OK' : 'Internal Error'}"
  }
}`}
                                </pre>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default LogsTab;
