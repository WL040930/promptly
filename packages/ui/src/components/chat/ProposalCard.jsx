import { normalizeProposalStatus, proposalStatusTone } from './proposalStatus.js';

const statusLabel = status => {
    const normalized = normalizeProposalStatus(status);
    if (normalized === 'applied') return 'Applied';
    if (normalized === 'rejected' || normalized === 'ignored') return 'Ignored';
    if (normalized === 'superseded') return 'Replaced';
    if (normalized === 'stale') return 'Outdated';
    return 'Awaiting approval';
};

export default function ProposalCard({ type, title, status, verification, children, actions }) {
    const isUnverified = verification?.status === 'unverified';
    const verificationIssues = (verification?.issues || []).map(issue => issue?.message).filter(Boolean);
    const tone = proposalStatusTone(status);

    return (
        <section className={`mt-2 w-full overflow-hidden rounded-2xl border bg-white shadow-sm ${tone?.card || 'border-slate-200 shadow-slate-900/5'}`}>
            <header className={`flex items-start gap-3 border-b px-4 py-3 ${tone?.header || 'border-slate-100 bg-slate-50/80'}`}>
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${tone?.icon || 'border-indigo-200 bg-indigo-50 text-indigo-600'}`}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round"><path d="M4 5h16v14H4z" /><path d="M8 9h8M8 13h5" /></svg>
                </div>
                <div className="min-w-0 flex-1">
                    <p className={`text-[10px] font-extrabold uppercase tracking-[0.14em] ${tone?.eyebrow || 'text-indigo-700'}`}>Proposed {type} changes</p>
                    <h4 className="mt-1 truncate text-sm font-bold text-slate-800">{title || `Proposed ${type} changes`}</h4>
                </div>
                <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold ${isUnverified ? 'border-amber-200 bg-amber-50 text-amber-800' : tone?.badge || 'border-slate-200 bg-white text-slate-600'}`}>
                    {isUnverified ? 'Unverified' : statusLabel(status)}
                </span>
            </header>

            <div className="flex flex-col gap-4 p-4">
                {isUnverified && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-900">
                        <p className="font-bold">Review required</p>
                        <p className="mt-1">This proposal passed local validation, but final AI verification was unavailable or did not pass. Review it carefully before applying changes.</p>
                        {verificationIssues.length > 0 && <ul className="mt-2 list-disc pl-4">{verificationIssues.map((message, index) => <li key={`${message}-${index}`}>{message}</li>)}</ul>}
                    </div>
                )}
                {children}
                {actions && <footer className="border-t border-slate-100 pt-3">{actions}</footer>}
            </div>
        </section>
    );
}
