import React, { useState, useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { useToast } from '../../components/ToastContext.jsx';
import { getWorkflows, createWorkflow, deleteWorkflow, triggerWorkflow } from '../../api/backend.js';

const WorkflowTab = () => {
    const toast = useToast();
    const container = useRef(null);
    const [workflows, setWorkflows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [workflowToDelete, setWorkflowToDelete] = useState(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [runningWorkflowId, setRunningWorkflowId] = useState(null);

    useGSAP(() => {
        gsap.from(container.current, { opacity: 0, y: 15, duration: 0.3, ease: 'power2.out' });
    }, { scope: container });

    useEffect(() => {
        const fetchWorkflows = async () => {
            try {
                const data = await getWorkflows();
                if (data) setWorkflows(data);
            } catch (err) {
                console.error('Failed to fetch workflows:', err);
                toast.error('Failed to load workflows.');
            } finally {
                setLoading(false);
            }
        };
        fetchWorkflows();
    }, []);

    const fetchWorkflows = async () => {
        setLoading(true);
        try {
            const data = await getWorkflows();
            if (data) setWorkflows(data);
        } catch (err) {
            console.error('Failed to fetch workflows:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateWorkflow = async () => {
        setIsCreating(true);
        try {
            const wfData = {
                name: 'New Sequence Automation',
                status: 'Draft',
                lastEdited: 'Just now',
                iconColor: 'text-indigo-600',
                iconBg: 'bg-indigo-100',
                nodes: []
            };
            const newWf = await createWorkflow(wfData);
            setWorkflows(prev => [...prev, newWf]);
            toast.success('Workflow created successfully!');
        } catch (e) {
            console.error("Failed to create workflow:", e);
            toast.error('Failed to create workflow.');
        } finally {
            setIsCreating(false);
        }
    };

    const handleRunNow = async (id, name) => {
        setRunningWorkflowId(id);
        try {
            await triggerWorkflow(id, {});
            toast.success(`Workflow "${name}" triggered successfully!`);
        } catch (error) {
            toast.error(`Failed to trigger workflow "${name}".`);
        } finally {
            setRunningWorkflowId(null);
        }
    };

    const confirmDeleteWorkflow = async () => {
        if (!workflowToDelete) return;
        setIsDeleting(true);
        try {
            await deleteWorkflow(workflowToDelete);
            toast.success('Workflow deleted successfully!');
            setWorkflows(prev => prev.filter(w => w.id !== workflowToDelete));
        } catch (error) {
            toast.error('Failed to delete workflow.');
        } finally {
            setIsDeleting(false);
            setWorkflowToDelete(null);
        }
    };

    return (
        <div ref={container} className="tab-content flex-1 overflow-y-auto bg-slate-50/50 font-sans relative p-6 md:p-8">
            <div className="max-w-6xl mx-auto flex flex-col gap-8">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-2xl font-semibold text-slate-900 tracking-tight">Your Workflows</h2>
                        <p className="text-sm text-slate-500 mt-1">Manage and execute your designed automation flows.</p>
                    </div>
                    <button 
                        onClick={handleCreateWorkflow}
                        disabled={isCreating}
                        className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm rounded-xl transition-all shadow-md shadow-indigo-500/20 disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center min-w-[110px]"
                    >
                        {isCreating ? (
                            <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                        ) : (
                            'Create New'
                        )}
                    </button>
                </div>

                <div className="grid grid-cols-1 gap-4">
                    {loading ? (
                        [1, 2, 3].map(i => (
                            <div key={i} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between gap-4">
                                <div className="flex items-center gap-5">
                                    <div className="w-12 h-12 rounded-xl bg-slate-200 animate-pulse shrink-0"></div>
                                    <div>
                                        <div className="h-5 w-40 bg-slate-200 animate-pulse rounded mb-2"></div>
                                        <div className="flex items-center gap-3">
                                            <div className="h-4 w-20 bg-slate-200 animate-pulse rounded"></div>
                                            <div className="h-4 w-16 bg-slate-200 animate-pulse rounded"></div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))
                    ) : workflows.length > 0 ? (
                        workflows.map(wf => (
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
                                                {wf.triggerType || 'Manual'}
                                            </span>
                                            <span className={`px-2 py-0.5 rounded border ${wf.status === 'Active' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
                                                {wf.status || 'Draft'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                
                                <div className="flex items-center gap-2">
                                    <button 
                                        onClick={() => handleRunNow(wf.id, wf.name)}
                                        disabled={runningWorkflowId === wf.id}
                                        className="px-4 py-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-medium text-sm rounded-lg transition-colors border border-indigo-200 disabled:opacity-50 disabled:cursor-not-allowed min-w-[90px] flex justify-center"
                                    >
                                        {runningWorkflowId === wf.id ? (
                                            <svg className="animate-spin h-5 w-5 text-indigo-700" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                            </svg>
                                        ) : 'Run Now'}
                                    </button>
                                    <button className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors border border-transparent hover:border-slate-200">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                    </button>
                                    <button 
                                        onClick={() => setWorkflowToDelete(wf.id)}
                                        className="p-2 text-red-400 hover:text-red-650 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-100"
                                    >
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                    </button>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="p-12 text-center border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center bg-white/50">
                            <div className="w-16 h-16 bg-slate-50 text-slate-400 rounded-full flex items-center justify-center mb-4">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                                    <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
                                    <line x1="12" y1="22.08" x2="12" y2="12"></line>
                                </svg>
                            </div>
                            <div className="text-slate-600 font-semibold mb-1">No workflows found</div>
                            <div className="text-slate-400 text-sm">Create a new workflow to automate your tasks.</div>
                        </div>
                    )}
                </div>
            </div>

            {/* Custom Delete Confirmation Modal */}
            {workflowToDelete && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-xl border border-slate-100 max-w-sm w-full p-6 animate-fade-in">
                        <div className="flex flex-col items-center text-center gap-3">
                            <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center text-red-500 mb-2">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                            </div>
                            <h3 className="text-lg font-bold text-slate-900">Delete Workflow?</h3>
                            <p className="text-sm text-slate-500">
                                This action cannot be undone. Are you sure you want to permanently delete this workflow?
                            </p>
                        </div>
                        <div className="flex gap-3 mt-8">
                            <button
                                disabled={isDeleting}
                                onClick={() => setWorkflowToDelete(null)}
                                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                disabled={isDeleting}
                                onClick={confirmDeleteWorkflow}
                                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-500 hover:bg-red-600 shadow-md shadow-red-500/20 transition-all flex items-center justify-center disabled:opacity-70 disabled:cursor-not-allowed"
                            >
                                {isDeleting ? (
                                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                ) : (
                                    'Delete'
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default WorkflowTab;
