import { useState } from 'react';
import { AlertCircle, ChevronDown, RotateCcw } from 'lucide-react';
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

    return (
        <section className="w-full overflow-hidden rounded-2xl border border-amber-200 bg-amber-50/70 shadow-sm">
            <div className="flex gap-3 border-b border-amber-100 bg-amber-100/50 px-4 py-3.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-amber-200 bg-white text-amber-700"><AlertCircle size={18} strokeWidth={2.25} /></span>
                <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900">{recovery.title}</p>
                    <p className="mt-0.5 text-xs font-semibold text-amber-800">No changes were made.</p>
                </div>
            </div>
            <div className="space-y-3 px-4 py-3.5">
                <p className="text-sm leading-6 text-slate-700">{recovery.summary}</p>
                {recovery.location && <p className="rounded-lg border border-amber-100 bg-white/70 px-3 py-2 text-xs leading-5 text-slate-700"><span className="font-bold text-slate-900">Where:</span> {recovery.location}</p>}
                {recovery.steps?.length > 0 && (
                    <ol className="space-y-1.5 text-xs leading-5 text-slate-600">
                        {recovery.steps.map((step, index) => <li key={`${step}-${index}`} className="flex gap-2"><span className="font-bold text-amber-700">{index + 1}.</span><span>{step}</span></li>)}
                    </ol>
                )}
                <div className="flex flex-wrap items-center gap-2 border-t border-amber-100 pt-3">
                    {action && <Button variant="primary" size="sm" onClick={() => onAction?.(action)} isLoading={isWorking} loadingText={action.label}>{action.type === 'retry' && <RotateCcw size={14} />}{action.label}</Button>}
                    {recovery.details?.length > 0 && <button type="button" onClick={() => setShowDetails(value => !value)} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-white hover:text-slate-900" aria-expanded={showDetails}><ChevronDown size={14} className={showDetails ? 'rotate-180 transition-transform' : 'transition-transform'} />Details</button>}
                </div>
                {showDetails && recovery.details?.length > 0 && <div className="rounded-xl border border-amber-100 bg-white/80 px-3 py-2.5 text-xs leading-5 text-slate-600">{recovery.details.map((detail, index) => <p key={`${detail.code || 'detail'}-${index}`}>{detail.message}</p>)}</div>}
            </div>
        </section>
    );
}
