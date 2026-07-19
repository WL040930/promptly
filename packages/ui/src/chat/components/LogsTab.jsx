import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { useExecutionLogs } from '../../api/hooks/useLogs.js';
import { useWorkflows } from '../../api/hooks/useWorkflows.js';
import LogFilters from './log-ui/LogFilters.jsx';
import LogInspector from './log-ui/LogInspector.jsx';
import LogList from './log-ui/LogList.jsx';
import LogPagination from './log-ui/LogPagination.jsx';
import { LogsListSkeleton } from './log-ui/LogsSkeleton.jsx';

const PAGE_SIZE = 10;
const INSPECTOR_TRANSITION_MS = 300;

const LogsTab = ({ workflowId: initialWorkflowId = '' } = {}) => {
    const container = useRef(null);
    const [searchInput, setSearchInput] = useState('');
    const [search, setSearch] = useState('');
    const [status, setStatus] = useState('All');
    const [workflowId, setWorkflowId] = useState(initialWorkflowId);
    const [page, setPage] = useState(1);
    const [selectedLogId, setSelectedLogId] = useState(null);
    const [inspectorLogId, setInspectorLogId] = useState(null);
    const [isInspectorOpen, setIsInspectorOpen] = useState(false);
    const inspectorOpenFrame = useRef(null);

    const { data: workflows = [] } = useWorkflows();
    const logsQuery = useExecutionLogs({ search, status, workflowId, page, pageSize: PAGE_SIZE });
    const { data: response, isFetching, isError, refetch } = logsQuery;
    const logs = response?.data || [];
    const pagination = response?.pagination;
    const showSkeleton = isFetching;

    useEffect(() => {
        if (isInspectorOpen || !inspectorLogId) return undefined;

        const timer = window.setTimeout(() => setInspectorLogId(null), INSPECTOR_TRANSITION_MS);
        return () => window.clearTimeout(timer);
    }, [inspectorLogId, isInspectorOpen]);

    useEffect(() => () => {
        if (inspectorOpenFrame.current !== null) {
            window.cancelAnimationFrame(inspectorOpenFrame.current);
        }
    }, []);

    useEffect(() => {
        const timer = window.setTimeout(() => setSearch(searchInput.trim()), 300);
        return () => window.clearTimeout(timer);
    }, [searchInput]);

    useGSAP(() => {
        gsap.from(container.current, { opacity: 0, y: 15, duration: 0.3, ease: 'power2.out' });
    }, { scope: container });

    const updateSearch = (value) => {
        setSearchInput(value);
        setPage(1);
    };

    const updateStatus = (value) => {
        setStatus(value);
        setPage(1);
        closeInspector();
    };

    const updateWorkflow = (value) => {
        setWorkflowId(value);
        setPage(1);
        closeInspector();
    };

    const clearFilters = () => {
        setSearchInput('');
        setSearch('');
        setStatus('All');
        setWorkflowId('');
        setPage(1);
        closeInspector();
    };

    const changePage = (nextPage) => {
        setPage(nextPage);
        closeInspector();
    };

    const openInspector = (logId) => {
        setSelectedLogId(logId);

        if (inspectorLogId) {
            setInspectorLogId(logId);
            setIsInspectorOpen(true);
            return;
        }

        setInspectorLogId(logId);
        inspectorOpenFrame.current = window.requestAnimationFrame(() => {
            inspectorOpenFrame.current = null;
            setIsInspectorOpen(true);
        });
    };

    function closeInspector() {
        if (inspectorOpenFrame.current !== null) {
            window.cancelAnimationFrame(inspectorOpenFrame.current);
            inspectorOpenFrame.current = null;
        }
        setSelectedLogId(null);
        setIsInspectorOpen(false);
    }

    return (
        <div ref={container} className="tab-content flex flex-1 min-h-0 h-full overflow-hidden bg-slate-50/80 font-sans">
            <div className="flex-1 min-w-0 overflow-y-auto p-5 md:p-8">
                <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
                    <div>
                        <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-500">Run history</p>
                        <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">Automation runs</h1>
                        <p className="mt-2 text-sm text-slate-500">Inspect automation runs, outcomes, and execution details.</p>
                    </div>

                    <LogFilters
                        search={searchInput}
                        status={status}
                        workflowId={workflowId}
                        workflows={workflows}
                        onSearchChange={updateSearch}
                        onStatusChange={updateStatus}
                        onWorkflowChange={updateWorkflow}
                        onClear={clearFilters}
                    />

                    {isError ? (
                        <div className="p-12 text-center border border-red-200 rounded-2xl flex flex-col items-center justify-center bg-red-50/50">
                            <div className="text-red-600 font-semibold mb-1">Unable to load logs</div>
                            <div className="text-red-500 text-sm mb-4">Please try again after checking your connection.</div>
                            <button type="button" onClick={() => refetch()} className="px-3 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700">
                                Try again
                            </button>
                        </div>
                    ) : showSkeleton ? (
                        <LogsListSkeleton />
                    ) : logs.length === 0 ? (
                        <div className="p-12 text-center border border-slate-200 rounded-2xl flex flex-col items-center justify-center bg-white/70">
                            <div className="text-slate-600 font-semibold mb-1">No runs found</div>
                            <div className="text-slate-400 text-sm">No runs match your current filters.</div>
                        </div>
                    ) : (
                        <>
                            <LogList logs={logs} selectedLogId={selectedLogId} onSelect={openInspector} />
                            <LogPagination pagination={pagination} onPageChange={changePage} />
                        </>
                    )}
                </div>
            </div>

            {inspectorLogId && (
                <LogInspector
                    logId={inspectorLogId}
                    isOpen={isInspectorOpen}
                    onClose={closeInspector}
                />
            )}
        </div>
    );
};

export default LogsTab;
