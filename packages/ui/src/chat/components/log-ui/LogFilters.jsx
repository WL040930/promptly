import { ChevronDown, Search, SlidersHorizontal, X } from 'lucide-react';

const STATUS_OPTIONS = ['All', 'Success', 'Waiting', 'Failed', 'Cancelled'];
const CONTROL_CLASS = 'h-11 box-border appearance-none bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 leading-5 outline-none focus:border-indigo-400 transition-colors';

const LogFilters = ({
    search,
    status,
    workflowId,
    workflows,
    onSearchChange,
    onStatusChange,
    onWorkflowChange,
    onClear
}) => {
    const hasFilters = Boolean(search || workflowId || status !== 'All');

    return (
        <div className="flex flex-col gap-3 bg-white border border-slate-200 p-3 rounded-2xl shadow-sm">
            <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
                <label className="relative flex-1 min-w-0">
                    <span className="sr-only">Search logs</span>
                    <Search size={16} aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <input
                        type="search"
                        value={search}
                        onChange={(event) => onSearchChange(event.target.value)}
                        placeholder="Search workflows, run IDs, triggers, or errors..."
                        className={`${CONTROL_CLASS} w-full pl-9 pr-3 text-slate-800 placeholder:text-slate-400`}
                    />
                </label>

                <label className="flex items-center gap-2 min-w-0 lg:w-64">
                    <SlidersHorizontal size={16} aria-hidden="true" className="text-slate-400 shrink-0" />
                    <div className="relative flex-1 min-w-0">
                        <span className="sr-only">Filter by workflow</span>
                        <select
                            value={workflowId}
                            onChange={(event) => onWorkflowChange(event.target.value)}
                            className={`${CONTROL_CLASS} w-full px-3 pr-9`}
                        >
                            <option value="">All workflows</option>
                            {workflows.map((workflow) => (
                                <option key={workflow.id} value={workflow.id}>{workflow.name}</option>
                            ))}
                        </select>
                        <ChevronDown size={16} aria-hidden="true" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                    </div>
                </label>

                {hasFilters && (
                    <button
                        type="button"
                        onClick={onClear}
                        title="Clear filters"
                        className="inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors"
                    >
                        <X size={15} aria-hidden="true" />
                        Clear
                    </button>
                )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5 select-none" role="tablist" aria-label="Log status">
                {STATUS_OPTIONS.map((option) => (
                    <button
                        type="button"
                        role="tab"
                        aria-selected={status === option}
                        key={option}
                        onClick={() => onStatusChange(option)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all border ${
                            status === option
                                ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                        }`}
                    >
                        {option}
                    </button>
                ))}
            </div>
        </div>
    );
};

export default LogFilters;
