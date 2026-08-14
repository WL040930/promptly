import { useState } from 'react';
import { AlertCircle, ArrowUpRight, CheckCircle2, ChevronDown, Link2, RotateCcw } from 'lucide-react';
import Button from '../ui/Button.jsx';
import { buildAssistantRecovery } from '../../../../shared/assistantRecovery.js';

export default function AssistantFailureCard({ message, onAction, isWorking }) {
    const [showDetails, setShowDetails] = useState(false);
    const metadata = message.errorMetadata || message.payload || {};
    const recovery = metadata.recovery || buildAssistantRecovery({
        surface: message.surface || 'assistant',
        code: metadata.code,
        issues: metadata.issues,
        context: { retryText: metadata.retryText }
    });
    const action = recovery.action;
    const isConnectionRequired = recovery.type === 'connection_required';
    const isGoogleReconnectRequired = metadata.code === 'GOOGLE_RECONNECT_REQUIRED';
    const actionIcon = action?.type === 'retry'
        ? <RotateCcw size={14} />
        : action?.type === 'open_connections'
            ? <ArrowUpRight size={14} />
            : <CheckCircle2 size={14} />;
    const RecoveryIcon = isConnectionRequired ? Link2 : AlertCircle;
    const cardTone = isConnectionRequired
        ? {
            card: 'border-indigo-200/80 bg-white shadow-sm shadow-indigo-900/5',
            header: 'border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-amber-50/70',
            icon: 'border-indigo-200 bg-white text-indigo-600',
            eyebrow: 'text-indigo-700',
            divider: 'border-indigo-100',
            detail: 'border-indigo-100 bg-indigo-50/50',
            number: 'bg-indigo-100 text-indigo-700'
        }
        : {
            card: 'border-amber-200 bg-amber-50/70 shadow-sm',
            header: 'border-amber-100 bg-amber-100/50',
            icon: 'border-amber-200 bg-white text-amber-700',
            eyebrow: 'text-amber-800',
            divider: 'border-amber-100',
            detail: 'border-amber-100 bg-white/70',
            number: 'text-amber-700'
        };

    return (
        <section className={`w-full overflow-hidden rounded-2xl border ${cardTone.card}`}>
            <div className={`flex items-start gap-3 border-b px-4 py-3.5 ${cardTone.header} ${cardTone.divider}`}>
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border shadow-sm ${cardTone.icon}`}><RecoveryIcon size={18} strokeWidth={2.25} /></span>
                <div className="min-w-0">
                    <p className={`text-[11px] font-bold uppercase tracking-[0.14em] ${cardTone.eyebrow}`}>{isConnectionRequired ? (isGoogleReconnectRequired ? 'Reconnect required' : 'Connection needed') : 'Request not completed'}</p>
                    <p className="mt-1 text-sm font-bold text-slate-900">{recovery.title}</p>
                </div>
                <span className="ml-auto hidden shrink-0 rounded-full border border-slate-200 bg-white/80 px-2.5 py-1 text-[10px] font-bold text-slate-500 sm:inline-flex">No changes made</span>
            </div>
            <div className="space-y-3 px-4 py-3.5">
                <p className="text-sm leading-6 text-slate-700">{recovery.summary}</p>
                {isConnectionRequired && (
                    <div className="flex items-center justify-between gap-3 rounded-xl border border-indigo-100 bg-indigo-50/50 px-3.5 py-3">
                        <div className="flex min-w-0 items-center gap-2.5">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-indigo-200 bg-white text-indigo-600"><Link2 size={15} /></span>
                            <div className="min-w-0">
                                <p className="truncate text-xs font-bold text-slate-800">Google Sheets</p>
                                <p className="truncate text-[11px] text-slate-500">{isGoogleReconnectRequired ? 'Reconnect to restore Sheet access' : 'Find or create the destination Sheet'}</p>
                            </div>
                        </div>
                        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-800"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" />{isGoogleReconnectRequired ? 'Needs reconnect' : 'Not connected'}</span>
                    </div>
                )}
                {recovery.location && <p className={`rounded-lg border px-3 py-2 text-xs leading-5 text-slate-700 ${cardTone.detail}`}><span className="font-bold text-slate-900">Where:</span> {recovery.location}</p>}
                {recovery.steps?.length > 0 && (
                    <ol className="space-y-2 text-xs leading-5 text-slate-600">
                        {recovery.steps.map((step, index) => <li key={`${step}-${index}`} className="flex items-start gap-2.5"><span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${isConnectionRequired ? cardTone.number : 'border border-amber-200 bg-white'}`}>{index + 1}</span><span className="pt-0.5">{step}</span></li>)}
                    </ol>
                )}
                <div className={`flex flex-wrap items-center gap-2 border-t pt-3 ${cardTone.divider}`}>
                    {action && <Button variant="primary" size="sm" className="flex-row whitespace-nowrap" iconLeft={actionIcon} onClick={() => onAction?.(action)} isLoading={isWorking} loadingText={action.label}>{action.label}</Button>}
                    {recovery.details?.length > 0 && <button type="button" onClick={() => setShowDetails(value => !value)} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-white hover:text-slate-900" aria-expanded={showDetails}><ChevronDown size={14} className={showDetails ? 'rotate-180 transition-transform' : 'transition-transform'} />Details</button>}
                </div>
                {showDetails && recovery.details?.length > 0 && <div className={`rounded-xl border px-3 py-2.5 text-xs leading-5 text-slate-600 ${cardTone.detail}`}>{recovery.details.map((detail, index) => <p key={`${detail.code || 'detail'}-${index}`}>{detail.message}</p>)}</div>}
            </div>
        </section>
    );
}
