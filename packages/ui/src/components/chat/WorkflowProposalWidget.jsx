import Button from '../ui/Button.jsx';
import ProposalCard from './ProposalCard.jsx';
import { isAcceptedProposalStatus, isRejectedProposalStatus, isStaleProposalStatus, normalizeProposalStatus } from './proposalStatus.js';
import { AssistantWorkDetails } from './AssistantWorkCard.jsx';

const toneFor = type => ({
    add: 'text-emerald-700 bg-emerald-50 border-emerald-100',
    remove: 'text-red-700 bg-red-50 border-red-100',
    update: 'text-amber-700 bg-amber-50 border-amber-100',
    connect: 'text-indigo-700 bg-indigo-50 border-indigo-100'
}[type] || 'text-slate-700 bg-slate-50 border-slate-200');

const markerFor = type => ({ add: '+', remove: '−', update: '~', connect: '→' }[type] || '•');

export default function WorkflowProposalWidget({ proposal, status, tokenUsage, onIgnore, onPreview, onSetupAction, onRegenerate, rejecting }) {
    const isAccepted = isAcceptedProposalStatus(status);
    const isRejected = isRejectedProposalStatus(status);
    const isStale = isStaleProposalStatus(status);
    const presentation = proposal?.presentation || {};
    const changes = presentation.changes || [];
    const setupRequirements = presentation.setupRequirements || [];
    const setupActions = presentation.setupActions || [];
    const assumptions = presentation.assumptions || [];
    const flow = presentation.flow || [];

    return (
        <ProposalCard type="workflow" title={presentation.title || 'Workflow changes'} status={status} verification={proposal?.verification} actions={
            isAccepted ? <Status text="Changes applied" tone="success" />
                : isRejected ? <Status text="Proposal ignored" />
                    : isStale ? <Status text={normalizeProposalStatus(status) === 'superseded' ? 'A newer proposal replaced this one.' : 'This proposal is outdated. Generate a new one.'} tone="warning" />
                        : <div className="flex items-center gap-2"><Button variant="ghost" size="sm" className="flex-1" onClick={onIgnore} isLoading={rejecting} loadingText="Ignoring…">Ignore</Button>{proposal?.verification?.status === 'unverified' && <Button variant="outline" size="sm" className="flex-1" onClick={onRegenerate}>Generate new</Button>}<Button variant="primary" size="sm" className="flex-1" onClick={onPreview}>Preview changes</Button></div>
        }>
                <p className="text-sm leading-6 text-slate-700">{presentation.outcome || 'Review the proposed workflow changes.'}</p>

                {flow.length > 0 && (
                    <div>
                        <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.13em] text-slate-400">Flow</p>
                        <div className="flex overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-semibold text-slate-700">
                            <div className="flex min-w-max items-center gap-2">{flow.map((step, index) => <span key={`${step}-${index}`} className="flex items-center gap-2"><span>{step}</span>{index < flow.length - 1 && <span className="text-indigo-500">→</span>}</span>)}</div>
                        </div>
                    </div>
                )}

                {changes.length > 0 && (
                    <div>
                        <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.13em] text-slate-400">What will change</p>
                        <div className="flex flex-col gap-1.5">
                            {changes.map(change => <div key={change.id} className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-xs ${toneFor(change.type)}`}>
                                <span className="font-bold">{markerFor(change.type)}</span>
                                <span className="min-w-0 flex-1"><span className="font-semibold">{change.label}</span>{change.detail && <span className="ml-1 text-slate-600">— {change.detail}</span>}</span>
                            </div>)}
                        </div>
                    </div>
                )}

                {assumptions.length > 0 && <div className="rounded-xl border border-amber-100 bg-amber-50/70 px-3 py-2.5 text-xs text-amber-900"><p className="font-bold">Assumptions</p>{assumptions.map(item => <p key={item} className="mt-1">• {item}</p>)}</div>}
                {setupRequirements.length > 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900"><p className="font-bold">Setup required before Apply</p>{setupRequirements.map(item => <p key={item} className="mt-1">• {item}</p>)}{setupActions.length > 0 && <div className="mt-3">{setupActions.map(action => <Button key={`${action.type}-${action.provider || ''}`} variant="outline" size="sm" onClick={() => onSetupAction?.(action)}>{action.label || 'Open settings'}</Button>)}</div>}</div>}
                {proposal?.work && <AssistantWorkDetails work={proposal.work} tokenUsage={tokenUsage} />}

        </ProposalCard>
    );
}

function Status({ text, tone = 'default' }) {
    const className = tone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : tone === 'warning' ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-slate-200 bg-slate-50 text-slate-600';
    return <div className={`rounded-xl border px-3 py-2.5 text-center text-xs font-semibold ${className}`}>{text}</div>;
}
