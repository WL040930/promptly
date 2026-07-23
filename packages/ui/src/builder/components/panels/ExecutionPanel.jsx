import { useState, useCallback } from 'react';

/* ─── Status icons ─────────────────────────────────────────────────────────── */
const SuccessIcon = () => (
    <svg className="w-4 h-4 text-emerald-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 6L9 17l-5-5" />
    </svg>
);

const FailIcon = () => (
    <svg className="w-4 h-4 text-red-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
);

const SkippedIcon = () => (
    <svg className="w-4 h-4 text-slate-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" /><line x1="8" y1="12" x2="16" y2="12" />
    </svg>
);

const ChevronIcon = ({ open }) => (
    <svg
        className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
    >
        <polyline points="6 9 12 15 18 9" />
    </svg>
);

/* ─── Step Row ──────────────────────────────────────────────────────────────── */
function StepRow({ step, index }) {
    const [open, setOpen] = useState(false);
    const [copied, setCopied] = useState(false);

    const isSuccess = step.status === 'success';
    const isFailed  = step.status === 'failed';

    const copyDetails = useCallback(async () => {
        await navigator.clipboard.writeText(step.details || '');
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    }, [step.details]);

    return (
        <div className={`border rounded-xl overflow-hidden transition-all ${
            isFailed  ? 'border-red-200 bg-red-50/30'    :
            isSuccess ? 'border-slate-200 bg-white'      :
                        'border-slate-200 bg-slate-50/50'
        }`}>
            {/* ── Step header (always visible) ──────────────────────────────── */}
            <button
                onClick={() => setOpen(o => !o)}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50 transition-colors"
            >
                {/* Step number */}
                <span className="w-5 h-5 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-500 shrink-0">
                    {index + 1}
                </span>

                {/* Status icon */}
                {isSuccess ? <SuccessIcon /> : isFailed ? <FailIcon /> : <SkippedIcon />}

                {/* Name */}
                <span className="flex-1 text-xs font-semibold text-slate-800 truncate">
                    {step.name}
                </span>

                {/* Type badge */}
                <span className="shrink-0 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-500">
                    {step.type}
                </span>

                {/* Duration */}
                <span className={`shrink-0 text-[10px] font-mono font-bold ${
                    isFailed ? 'text-red-500' : 'text-slate-400'
                }`}>
                    {step.time}
                </span>

                <ChevronIcon open={open} />
            </button>

            {/* ── Expanded detail section ──────────────────────────────────── */}
            {open && (
                <div className="px-3 pb-3 border-t border-slate-100">
                    <div className="flex items-start justify-between gap-2 mt-2.5">
                        <p className={`text-[11px] leading-relaxed font-medium flex-1 ${
                            isFailed ? 'text-red-700' : 'text-slate-600'
                        }`}>
                            {step.details || 'No details available.'}
                        </p>

                        <button
                            onClick={copyDetails}
                            title="Copy details"
                            className="shrink-0 p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                        >
                            {copied ? (
                                <svg className="w-3.5 h-3.5 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                    <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            ) : (
                                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                </svg>
                            )}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

/* ─── Summary bar ──────────────────────────────────────────────────────────── */
function SummaryBar({ log }) {
    const passed  = log.steps?.filter(s => s.status === 'success').length ?? 0;
    const failed  = log.steps?.filter(s => s.status === 'failed').length  ?? 0;
    const total   = log.steps?.length ?? 0;
    const normalizedStatus = String(log.status || '').toLowerCase();
    const overall = normalizedStatus === 'success';
    const waiting = ['waiting', 'running', 'resuming', 'pending'].includes(normalizedStatus);
    const tone = overall ? 'emerald' : waiting ? 'amber' : 'red';

    return (
        <div className={`flex items-center gap-3 px-4 py-3 border-b ${
            tone === 'emerald' ? 'bg-emerald-50 border-emerald-100' : tone === 'amber' ? 'bg-amber-50 border-amber-100' : 'bg-red-50 border-red-100'
        }`}>
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                tone === 'emerald' ? 'bg-emerald-100' : tone === 'amber' ? 'bg-amber-100' : 'bg-red-100'
            }`}>
                {overall ? (
                    <svg className="w-4 h-4 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6L9 17l-5-5" />
                    </svg>
                ) : waiting ? (
                    <svg className="w-4 h-4 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
                    </svg>
                ) : (
                    <svg className="w-4 h-4 text-red-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                )}
            </div>

            <div className="flex-1 min-w-0">
                <p className={`text-sm font-bold ${tone === 'emerald' ? 'text-emerald-800' : tone === 'amber' ? 'text-amber-800' : 'text-red-800'}`}>
                    {overall ? 'Run Succeeded' : waiting ? 'Run Waiting' : 'Run Failed'}
                </p>
                <p className={`text-[11px] font-medium ${tone === 'emerald' ? 'text-emerald-600' : tone === 'amber' ? 'text-amber-600' : 'text-red-600'}`}>
                    {waiting ? 'Waiting for approval' : `${passed}/${total} steps passed · ${log.durationMs}ms total`}
                </p>
            </div>

            <div className="flex gap-1 items-center shrink-0">
                {passed > 0 && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
                        {passed} ✓
                    </span>
                )}
                {failed > 0 && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200">
                        {failed} ✗
                    </span>
                )}
            </div>
        </div>
    );
}

/* ─── ExecutionPanel ───────────────────────────────────────────────────────── */
/**
 * Slide-in drawer that shows execution results after a test run.
 *
 * Props:
 *   isOpen    — boolean
 *   onClose   — () => void
 *   log       — ExecutionLog object { status, durationMs, steps, error }
 *   isLoading — boolean (while API is in flight)
 *   runType    — 'test' or 'production'
 */
const ExecutionPanel = ({ isOpen, onClose, log, isLoading, runType = 'test' }) => {
    const isProduction = runType === 'production';

    return (
        <>
            {/* Backdrop */}
            {isOpen && (
                <div
                    className="fixed inset-0 z-[800] bg-slate-900/20 backdrop-blur-sm"
                    onClick={onClose}
                />
            )}

            {/* Panel */}
            <div
                className={`fixed right-0 top-0 h-full z-[900] w-[420px] max-w-full bg-white border-l border-slate-200 shadow-2xl flex flex-col transition-transform duration-300 ${
                    isOpen ? 'translate-x-0' : 'translate-x-full'
                }`}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-200 bg-slate-50/80 shrink-0">
                    <div className="flex items-center gap-2">
                        <svg className="w-4 h-4 text-indigo-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polygon points="5 3 19 12 5 21 5 3" />
                        </svg>
                        <h3 className="text-sm font-bold text-slate-900">
                            {isProduction ? 'Live Run Results' : 'Test Run Results'}
                        </h3>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto">
                    {/* Loading state */}
                    {isLoading && (
                        <div className="flex flex-col items-center justify-center gap-4 h-64">
                            <div className="relative">
                                <div className="w-10 h-10 rounded-full border-2 border-indigo-200" />
                                <div className="w-10 h-10 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin absolute inset-0" />
                            </div>
                            <p className="text-sm font-medium text-slate-500">
                                {isProduction ? 'Running live automation…' : 'Running workflow…'}
                            </p>
                        </div>
                    )}

                    {/* Empty state */}
                    {!isLoading && !log && (
                        <div className="flex flex-col items-center justify-center gap-3 h-64 text-center px-6">
                            <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center">
                                <svg className="w-5 h-5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polygon points="5 3 19 12 5 21 5 3" />
                                </svg>
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-slate-700">No results yet</p>
                                <p className="text-xs text-slate-400 mt-1">
                                    Click {isProduction ? '"Run live"' : '"Test Run"'} in the toolbar to execute this workflow
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Results */}
                    {!isLoading && log && (
                        <div>
                            <SummaryBar log={log} />

                            {/* Error banner */}
                            {log.error && (
                                <div className="mx-4 mt-4 px-3 py-2.5 bg-red-50 border border-red-200 rounded-xl">
                                    <p className="text-xs font-bold text-red-700 mb-0.5">Error</p>
                                    <p className="text-xs text-red-600 font-mono break-all">{log.error}</p>
                                </div>
                            )}

                            {/* Step list */}
                            <div className="p-4 flex flex-col gap-2">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">
                                    Execution Steps
                                </p>
                                {(log.steps || []).map((step, i) => (
                                    <StepRow key={i} step={step} index={i} />
                                ))}
                                {(!log.steps || log.steps.length === 0) && (
                                    <p className="text-xs text-slate-400 italic text-center py-4">No steps recorded.</p>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer hint */}
                {!isLoading && log && (
                    <div className="px-4 py-3 border-t border-slate-100 bg-slate-50/80 shrink-0">
                        <p className="text-[10px] text-slate-400 text-center">
                            Execution log ID: <span className="font-mono">{log.id}</span>
                        </p>
                    </div>
                )}
            </div>
        </>
    );
};

export default ExecutionPanel;
