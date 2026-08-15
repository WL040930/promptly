import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { Activity } from 'lucide-react';
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
    const [cursor, setCursor] = useState(null);
    const [cursorHistory, setCursorHistory] = useState([]);
    const [selectedLogId, setSelectedLogId] = useState(null);
    const [inspectorLogId, setInspectorLogId] = useState(null);
    const [isInspectorOpen, setIsInspectorOpen] = useState(false);
    const inspectorOpenFrame = useRef(null);

    const { data: workflows = [] } = useWorkflows();
    const logsQuery = useExecutionLogs({ search, status, workflowId, cursor, pageSize: PAGE_SIZE });
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
        setCursor(null);
        setCursorHistory([]);
    };

    const updateStatus = (value) => {
        setStatus(value);
        setPage(1);
        setCursor(null);
        setCursorHistory([]);
        closeInspector();
    };

    const updateWorkflow = (value) => {
        setWorkflowId(value);
        setPage(1);
        setCursor(null);
        setCursorHistory([]);
        closeInspector();
    };

    const clearFilters = () => {
        setSearchInput('');
        setSearch('');
        setStatus('All');
        setWorkflowId('');
        setPage(1);
        setCursor(null);
        setCursorHistory([]);
        closeInspector();
    };

    const changePage = (nextPage) => {
        if (nextPage > page) {
            if (!pagination?.nextCursor) return;
            setCursorHistory(history => [...history, cursor]);
            setCursor(pagination.nextCursor);
        } else if (nextPage < page) {
            const previousCursor = cursorHistory.at(-1) ?? null;
            setCursorHistory(history => history.slice(0, -1));
            setCursor(previousCursor);
        }
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
        <div ref={container} className="logs-workspace tab-content surface-grid relative flex h-full min-h-0 flex-1 overflow-hidden font-sans">
            <div className="flex-1 min-w-0 overflow-y-auto p-5 md:p-8">
                <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
                    <div>
                        <p className="eyebrow">Run history</p>
                        <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-slate-900">Automation runs</h1>
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
                        <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-slate-50/50 p-12 text-center">
                            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
                                <Activity className="h-6 w-6 text-slate-400" />
                            </div>
                            <h3 className="text-sm font-semibold text-slate-900">No runs found</h3>
                            <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">No runs match your current filters.</p>
                        </div>
                    ) : (
                        <>
                            <LogList logs={logs} selectedLogId={selectedLogId} onSelect={openInspector} />
                            <LogPagination pagination={{ ...pagination, page, hasPreviousPage: page > 1 }} onPageChange={changePage} />
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
