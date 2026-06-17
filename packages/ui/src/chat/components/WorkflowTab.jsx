import React, { useState } from 'react';

const WORKFLOWS = [
    { id: 1, name: 'Lead Capture to CRM', trigger: 'Webhook', status: 'Active', runs: 412 },
    { id: 2, name: 'Monthly Invoice Generator', trigger: 'Schedule (Monthly)', status: 'Active', runs: 12 },
    { id: 3, name: 'GitHub Star to Slack', trigger: 'GitHub Event', status: 'Draft', runs: 0 },
    { id: 4, name: 'PDF Text Extractor', trigger: 'New File in Drive', status: 'Active', runs: 84 },
];

const WorkflowTab = () => {
    const [toast, setToast] = useState(null);

    const handleRunNow = (name) => {
        setToast(`Workflow "${name}" triggered successfully!`);
        setTimeout(() => setToast(null), 3000);
    };

    return (
        <div className="flex-1 overflow-y-auto bg-slate-50/50 font-sans relative p-6 md:p-8">
            {/* Toast Notification */}
            <div className={`fixed bottom-8 left-1/2 -translate-x-1/2 px-6 py-3 bg-slate-900 text-white font-medium text-sm rounded-full shadow-2xl transition-all duration-300 z-50 ${toast ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0 pointer-events-none'}`}>
                {toast}
            </div>

            <div className="max-w-6xl mx-auto flex flex-col gap-8">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-2xl font-semibold text-slate-900 tracking-tight">Your Workflows</h2>
                        <p className="text-sm text-slate-500 mt-1">Manage and execute your designed automation flows.</p>
                    </div>
                    <button className="px-5 py-2.5 bg-blue-600 hover:bg-blue-750 text-white font-medium text-sm rounded-xl transition-all shadow-md shadow-blue-500/10">
                        Create New
                    </button>
                </div>

                <div className="grid grid-cols-1 gap-4">
                    {WORKFLOWS.map(wf => (
                        <div key={wf.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow flex items-center justify-between flex-wrap gap-4">
                            <div className="flex items-center gap-5">
                                <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${wf.status === 'Active' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
                                    </svg>
                                </div>
                                <div>
                                    <h3 className="font-semibold text-slate-800 text-lg">{wf.name}</h3>
                                    <div className="flex items-center gap-3 mt-1 text-xs font-medium">
                                        <span className="text-slate-500 flex items-center gap-1">
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                                            {wf.trigger}
                                        </span>
                                        <span className={`px-2 py-0.5 rounded border ${wf.status === 'Active' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
                                            {wf.status}
                                        </span>
                                        <span className="text-slate-400">
                                            {wf.runs} runs
                                        </span>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="flex items-center gap-2">
                                <button 
                                    onClick={() => handleRunNow(wf.name)}
                                    className="px-4 py-2 bg-blue-50 text-blue-700 hover:bg-blue-100 font-medium text-sm rounded-lg transition-colors border border-blue-200"
                                >
                                    Run Now
                                </button>
                                <button className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors border border-transparent hover:border-slate-200">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                </button>
                                <button className="p-2 text-red-400 hover:text-red-650 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-100">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default WorkflowTab;
