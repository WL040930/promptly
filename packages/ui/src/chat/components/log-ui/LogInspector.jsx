import { useState } from 'react';
import { Check, CheckCircle2, Circle, Copy, X, XCircle } from 'lucide-react';
import { useExecutionLog } from '../../../api/hooks/useLogs.js';
import { formatDuration, formatLogDate, getStatusClasses, getWorkflowName } from './logFormatters.js';
import { LogInspectorSkeleton } from './LogsSkeleton.jsx';

const LogInspector = ({ logId, isOpen = true, onClose }) => {
    const [hasCopied, setHasCopied] = useState(false);
    const { data: log, isPending, isError } = useExecutionLog(logId);

    const copyRunId = async () => {
        if (!log?.id || !navigator.clipboard) return;
        await navigator.clipboard.writeText(log.id);
        setHasCopied(true);
        window.setTimeout(() => setHasCopied(false), 1500);
    };

    const statusClasses = getStatusClasses(log?.status);

    return (
        <div className={`shrink-0 overflow-hidden transition-[width] duration-300 ease-out motion-reduce:transition-none ${isOpen ? 'w-full lg:w-[420px]' : 'w-0'}`}>
            <aside className={`w-full lg:w-[420px] h-full flex flex-col border-l border-slate-200 bg-white shadow-2xl transform transition-transform duration-300 ease-out will-change-transform motion-reduce:transition-none ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50 shrink-0">
                <div className="min-w-0">
                    <h3 className="font-semibold text-slate-900 text-sm sm:text-base">Run details</h3>
                    <span className="font-mono text-xs text-slate-500 truncate block max-w-64">{logId}</span>
                </div>
                <div className="flex items-center gap-1">
                    <button
                        type="button"
                        onClick={copyRunId}
                        title="Copy run ID"
                        aria-label="Copy run ID"
                        className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-400 hover:text-slate-700 transition-colors"
                    >
                        {hasCopied ? <Check size={18} aria-hidden="true" /> : <Copy size={18} aria-hidden="true" />}
                    </button>
                    <button
                        type="button"
                        onClick={onClose}
                        title="Close inspector"
                        aria-label="Close inspector"
                        className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-400 hover:text-slate-700 transition-colors"
                    >
                        <X size={18} aria-hidden="true" />
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
                {isPending ? (
                    <LogInspectorSkeleton />
                ) : isError || !log ? (
                    <div className="p-6 text-center rounded-xl border border-red-200 bg-red-50 text-sm text-red-700">
                        Unable to load this execution.
                    </div>
                ) : (
                    <div className="flex flex-col gap-6">
                        <div>
                            <h4 className="font-semibold text-slate-900">{getWorkflowName(log)}</h4>
                            <p className="text-xs text-slate-500 mt-1">{log.trigger || 'Manual run'} on {formatLogDate(log.time)}</p>
                        </div>

                        <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-200 text-xs sm:text-sm">
                            <div className="flex flex-col gap-0.5">
                                <span className="font-medium text-slate-500 text-xs">Duration</span>
                                <span className="font-semibold text-slate-800">{formatDuration(log.durationMs)}</span>
                            </div>
                            <div className="flex flex-col gap-0.5">
                                <span className="font-medium text-slate-500 text-xs">Outcome</span>
                                <span className={`inline-flex items-center gap-1 font-semibold ${statusClasses.icon}`}>
                                    {log.status === 'Success' ? <CheckCircle2 size={14} aria-hidden="true" /> : <XCircle size={14} aria-hidden="true" />}
                                    {log.status}
                                </span>
                            </div>
                        </div>

                        {log.error && (
                            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                                {log.error}
                            </div>
                        )}

                        <div className="flex flex-col gap-3">
                            <span className="text-xs font-semibold text-slate-500">Execution path</span>
                            {log.steps?.length ? (
                                <div className="flex flex-col pl-4 relative border-l border-slate-200 ml-1.5 gap-5">
                                    {log.steps.map((step, index) => {
                                        const isSuccess = step.status === 'success';
                                        const isFailed = step.status === 'failed';
                                        const stepIconClass = isSuccess ? 'text-emerald-600' : isFailed ? 'text-red-600' : 'text-slate-400';

                                        return (
                                            <div key={`${step.name}-${index}`} className="relative flex flex-col gap-1">
                                                <div className={`absolute -left-[24px] top-0 w-[18px] h-[18px] rounded-full ring-2 ring-white bg-white flex items-center justify-center ${stepIconClass}`}>
                                                    {isSuccess ? <CheckCircle2 size={16} aria-hidden="true" /> : isFailed ? <XCircle size={16} aria-hidden="true" /> : <Circle size={12} aria-hidden="true" />}
                                                </div>
                                                <div className="flex items-center justify-between gap-2 pl-2">
                                                    <span className={`text-xs sm:text-sm font-medium ${step.status === 'skipped' ? 'text-slate-400' : 'text-slate-800'}`}>{step.name}</span>
                                                    <span className="text-xs font-medium text-slate-400 shrink-0">{step.time}</span>
                                                </div>
                                                <p className="text-xs font-medium text-slate-500 pl-2 leading-relaxed break-words">{step.details}</p>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <p className="text-sm text-slate-500">No step details were recorded.</p>
                            )}
                        </div>

                        <div className="flex flex-col gap-2.5">
                            <span className="text-xs font-semibold text-slate-500">Run metadata</span>
                            <div className="bg-slate-900 border border-slate-800 text-indigo-100 p-4 rounded-2xl text-xs font-mono shadow-inner overflow-x-auto select-all leading-relaxed">
                                <pre>{JSON.stringify({
                                    workflow: getWorkflowName(log),
                                    trigger: log.trigger,
                                    time: log.time,
                                    runId: log.id,
                                    tags: log.tags || []
                                }, null, 2)}</pre>
                            </div>
                        </div>
                    </div>
                )}
            </div>
            </aside>
        </div>
    );
};

export default LogInspector;
