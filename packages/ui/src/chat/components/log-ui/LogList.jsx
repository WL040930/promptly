import { CheckCircle2, Clock3, XCircle } from 'lucide-react';
import { formatDuration, formatLogDate, getStatusClasses, getWorkflowName } from './logFormatters.js';

const StatusIcon = ({ status, className }) => {
    if (status === 'Success') return <CheckCircle2 size={16} aria-hidden="true" className={className} />;
    return <XCircle size={16} aria-hidden="true" className={className} />;
};

const LogList = ({ logs, selectedLogId, onSelect }) => (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        {logs.map((log) => {
            const statusClasses = getStatusClasses(log.status);
            const workflowName = getWorkflowName(log);

            return (
                <button
                    type="button"
                    key={log.id}
                    onClick={() => onSelect(log.id)}
                    aria-pressed={selectedLogId === log.id}
                    className={`w-full text-left p-4 flex items-center justify-between gap-4 cursor-pointer hover:bg-slate-50 transition-colors select-none border-t border-slate-100 first:border-t-0 border-l-4 ${
                        selectedLogId === log.id
                            ? 'bg-indigo-50/40 border-l-indigo-600'
                            : 'border-l-transparent'
                    }`}
                >
                    <div className="flex flex-col gap-1.5 min-w-0 flex-1">
                        <div className="flex items-center gap-2.5 min-w-0">
                            <span className="font-semibold text-slate-900 text-sm sm:text-base truncate">{workflowName}</span>
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-medium shrink-0 ${statusClasses.badge}`}>
                                <StatusIcon status={log.status} className={statusClasses.icon} />
                                {log.status}
                            </span>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap text-xs font-medium text-slate-500">
                            <span>{log.trigger || 'Manual run'}</span>
                            <span aria-hidden="true">|</span>
                            <span>{formatLogDate(log.time)}</span>
                            <span aria-hidden="true">|</span>
                            <span className="font-mono text-slate-400 truncate max-w-[18rem]">Run ID: {log.id}</span>
                        </div>

                        {log.error && (
                            <div className="text-xs font-medium text-red-600 bg-red-50/50 border border-red-100 rounded-lg py-1.5 px-3 mt-1 leading-relaxed truncate">
                                {log.error}
                            </div>
                        )}
                    </div>

                    <div className="flex flex-col items-end gap-1.5 shrink-0 select-none">
                        <span className="inline-flex items-center gap-1 text-xs sm:text-sm font-medium text-slate-800">
                            <Clock3 size={14} aria-hidden="true" className="text-slate-400" />
                            {formatDuration(log.durationMs)}
                        </span>
                        {log.tags?.length > 0 && (
                            <div className="flex gap-1 max-w-32 overflow-hidden">
                                {log.tags.slice(0, 2).map((tag) => (
                                    <span key={tag} className="text-xs font-medium text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 truncate">
                                        {tag}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                </button>
            );
        })}
    </div>
);

export default LogList;
