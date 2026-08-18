import { useEffect, useMemo, useState } from 'react';
import { ArrowUpDown, Check, ChevronDown, ChevronRight, Eye, ListChecks, X } from 'lucide-react';
import Button from '../ui/Button.jsx';
import { formatFormSettingValue, getFormSettingLabel } from '../../forms/settings/formSettingPresentation.js';
import { isAcceptedProposalStatus, isRejectedProposalStatus, isStaleProposalStatus, normalizeProposalStatus } from './proposalStatus.js';
import { selectedFormPatchIds, visibleFormPatches } from './formProposalSelection.js';
import { AssistantWorkDetails } from './AssistantWorkCard.jsx';
import { displayWorkflowActionLabel } from '../../utils/workflowLabels.js';

const titleFor = patch => patch.op === 'add' ? patch.field?.label || 'New question'
    : patch.op === 'remove' ? patch.label || patch.originalField?.label || 'Question'
        : patch.op === 'move' ? patch.label || patch.originalField?.label || 'Question'
        : patch.op === 'update' ? patch.label || patch.field?.label || patch.originalField?.label || 'Question'
            : patch.op === 'update_meta' ? 'Form details'
                : patch.op === 'update_settings' ? 'Form settings'
                    : 'Remember this preference';
const detailFor = patch => patch.op === 'add' ? `${patch.field?.type || 'text'} question`
    : patch.op === 'remove' ? 'Remove from this form'
        : patch.op === 'move' ? (patch.insertBefore ? `Move before ${patch.anchorLabel || patch.insertBefore}` : patch.insertAfter ? `Move after ${patch.anchorLabel || patch.insertAfter}` : 'Move to the end')
        : patch.op === 'update' ? 'Update this existing question'
            : patch.op === 'update_meta' ? 'Title or description'
                : patch.op === 'update_memory' ? patch.updates?.memory?.summary || 'Persistent form preference'
                    : `${Object.keys(patch.updates || {}).length} setting${Object.keys(patch.updates || {}).length === 1 ? '' : 's'} changed`;
const groupFor = patch => ['add', 'update', 'remove', 'move'].includes(patch.op) ? 'Questions' : patch.op === 'update_meta' ? 'Form details' : 'Settings & confirmation';
const toneFor = patch => patch.op === 'remove' ? 'border-rose-100 bg-rose-50/45 text-rose-800'
    : patch.op === 'add' ? 'border-emerald-100 bg-emerald-50/45 text-emerald-800'
        : patch.op === 'move' ? 'border-amber-100 bg-amber-50/45 text-amber-800'
        : 'border-slate-200 bg-white text-slate-800';
const markerFor = patch => patch.op === 'add' ? '+' : patch.op === 'remove' ? '−' : patch.op === 'move' ? <ArrowUpDown size={14} strokeWidth={2.5} aria-hidden="true" /> : '~';

const planDataFor = proposal => {
    const plan = Array.isArray(proposal?.plan) ? { steps: proposal.plan } : proposal?.plan || {};
    const outcomes = Array.isArray(plan.outcomes) ? plan.outcomes : [];
    const steps = Array.isArray(plan.steps)
        ? plan.steps
        : Array.isArray(plan.execution?.steps) ? plan.execution.steps : [];
    return { plan, outcomes, steps };
};

const ProposalPlanDetails = ({ proposal, isRejected }) => {
    const { plan, outcomes, steps } = planDataFor(proposal);
    if (!plan.summary && outcomes.length === 0 && steps.length === 0) return null;
    const tone = isRejected
        ? { border: 'border-slate-200', background: 'bg-slate-50/70', heading: 'text-slate-700', badge: 'border-slate-200 bg-white text-slate-600', number: 'border-slate-300 bg-white text-slate-600' }
        : { border: 'border-violet-100', background: 'bg-violet-50/50', heading: 'text-violet-700', badge: 'border-violet-200 bg-white text-violet-800', number: 'border-violet-200 bg-violet-50 text-violet-700' };

    return <section className={`mb-4 overflow-hidden rounded-xl border ${tone.border} ${tone.background}`}>
        <div className={`flex items-center justify-between gap-3 border-b ${tone.border} px-3 py-2.5`}>
            <div className={`flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.14em] ${tone.heading}`}>
                <ListChecks size={14} aria-hidden="true" />
                Request plan
            </div>
            <span className={`rounded-full border px-2 py-1 text-[10px] font-bold ${tone.badge}`}>
                {steps.length > 0 ? `${steps.length} ${steps.length === 1 ? 'step' : 'steps'}` : `${outcomes.length} ${outcomes.length === 1 ? 'outcome' : 'outcomes'}`}
            </span>
        </div>
        <div className="space-y-3 px-3 py-3">
            {plan.summary && <p className="text-xs leading-5 text-slate-600">{plan.summary}</p>}
            {outcomes.length > 0 && <div>
                <p className="mb-1.5 text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-400">Outcomes</p>
                <div className="space-y-1.5">
                    {outcomes.map((outcome, index) => <div key={outcome.id || `${outcome.title}-${index}`} className="rounded-lg border border-white/80 bg-white/75 px-2.5 py-2">
                        <p className="text-xs font-bold text-slate-800">{outcome.title || outcome.type || `Outcome ${index + 1}`}</p>
                        {outcome.description && <p className="mt-0.5 text-[11px] leading-4 text-slate-500">{outcome.description}</p>}
                    </div>)}
                </div>
            </div>}
            {steps.length > 0 && <div>
                <p className="mb-1.5 text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-400">Steps</p>
                <ol className="space-y-1.5">
                    {steps.map((step, index) => <li key={step.id || `${step.title || step.type}-${index}`} className="flex items-start gap-2.5 rounded-lg border border-white/80 bg-white/75 px-2.5 py-2">
                        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-extrabold ${tone.number}`}>{index + 1}</span>
                        <span className="min-w-0">
                            <span className="block text-xs font-bold text-slate-800">{displayWorkflowActionLabel(step.title || step.description || step.type || `Step ${index + 1}`)}</span>
                            {step.description && step.description !== step.title && <span className="mt-0.5 block text-[11px] leading-4 text-slate-500">{step.description}</span>}
                        </span>
                    </li>)}
                </ol>
            </div>}
        </div>
    </section>;
};

export default function FormProposalWidget({ proposal, status, summary, tokenUsage, onIgnore, onPreview, onPreviewUpdate, onRegenerate, rejecting }) {
    const isAccepted = isAcceptedProposalStatus(status);
    const isRejected = isRejectedProposalStatus(status);
    const isStale = isStaleProposalStatus(status);
    const isReplaced = normalizeProposalStatus(status) === 'superseded';
    const locked = isAccepted || isRejected || isStale;
    const [selected, setSelected] = useState({});
    const [expanded, setExpanded] = useState({});
    const [showAppliedDetails, setShowAppliedDetails] = useState(false);
    const patches = useMemo(() => visibleFormPatches(proposal), [proposal]);
    const groups = useMemo(() => patches.reduce((result, patch, index) => {
        const name = groupFor(patch);
        (result[name] ||= []).push({ patch, index });
        return result;
    }, {}), [patches]);
    const selectedCount = Object.values(selected).filter(Boolean).length;
    const isUnverified = proposal?.verification?.status === 'unverified';
    const isAskPromptlyReview = proposal?.work?.surface === 'ask_promptly';

    useEffect(() => setSelected(Object.fromEntries(patches.map(patch => [patch.patchId, !proposal?.unselectedPatchIds?.includes(patch.patchId)]))), [proposal, patches]);

    const filtered = () => {
        const selectedPatchIds = selectedFormPatchIds(patches, selected);
        const unselectedPatchIds = patches.filter(patch => !selected[patch.patchId]).map(patch => patch.patchId);
        const schema = { ...proposal.schema, settings: { ...(proposal.schema?.settings || {}) }, fields: [...(proposal.schema?.fields || [])] };
        patches.filter(patch => unselectedPatchIds.includes(patch.patchId)).reverse().forEach(patch => {
            if (patch?.op === 'add') schema.fields = schema.fields.filter(field => field.id !== patch.field?.id);
            if (patch?.op === 'remove' && patch.originalField) schema.fields.splice(patch.originalIndex ?? schema.fields.length, 0, patch.originalField);
            if (patch?.op === 'move' && patch.originalField) {
                schema.fields = schema.fields.filter(field => field.id !== patch.id);
                schema.fields.splice(Math.min(patch.originalIndex ?? schema.fields.length, schema.fields.length), 0, patch.originalField);
            }
            if (patch?.op === 'update' && patch.originalField) schema.fields = schema.fields.map(field => field.id === patch.id ? patch.originalField : field);
            if (patch?.op === 'update_meta' && patch.originalMeta) Object.assign(schema, patch.originalMeta);
            if (patch?.op === 'update_settings') schema.settings = { ...(patch.originalSettings || {}) };
            if (patch?.op === 'update_memory') patch.originalMemory ? (schema.settings.aiMemory = patch.originalMemory) : delete schema.settings.aiMemory;
        });
        return { ...proposal, schema, patches: patches.filter(patch => selectedPatchIds.includes(patch.patchId)), selectedPatchIds };
    };

    useEffect(() => { if (!locked && onPreviewUpdate && proposal?.schema) onPreviewUpdate(filtered());
    // Preview follows the explicit selection state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selected]);

    const chooseAll = value => setSelected(Object.fromEntries(patches.map(patch => [patch.patchId, value])));
    const toggle = patchId => !locked && setSelected(previous => ({ ...previous, [patchId]: !previous[patchId] }));
    const addedCount = patches.filter(patch => patch.op === 'add').length;
    const updatedCount = patches.filter(patch => ['update', 'move', 'update_meta', 'update_settings'].includes(patch.op)).length;
    const removedCount = patches.filter(patch => patch.op === 'remove').length;
    const countSummary = [addedCount ? `${addedCount} added` : null, updatedCount ? `${updatedCount} updated` : null, removedCount ? `${removedCount} removed` : null].filter(Boolean).join(' · ');

    if (isAccepted) return <section className="mt-2 w-full overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-sm shadow-emerald-900/5">
        <button type="button" onClick={() => setShowAppliedDetails(value => !value)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-emerald-50/40" aria-expanded={showAppliedDetails}>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700"><Check size={17} strokeWidth={3} /></span>
            <span className="min-w-0 flex-1"><span className="block text-[10px] font-extrabold uppercase tracking-[0.14em] text-emerald-700">Changes applied</span><span className="mt-0.5 block truncate text-sm font-extrabold text-slate-900">{proposal?.schema?.title || 'Form updated'}</span><span className="mt-0.5 block text-xs text-slate-500">{countSummary || `${patches.length} changes applied`}</span></span>
            <span className="flex items-center gap-1 text-[11px] font-bold text-slate-500">{showAppliedDetails ? 'Hide' : 'View changes'}<ChevronDown size={15} className={`transition-transform ${showAppliedDetails ? 'rotate-180' : ''}`} /></span>
        </button>
        {showAppliedDetails && <div className="border-t border-slate-100 bg-slate-50/55 px-4 py-3"><div className="space-y-3">{Object.entries(groups).map(([group, entries]) => <div key={group}><p className="mb-1 text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-400">{group}</p><div className="overflow-hidden rounded-xl border border-slate-200 bg-white">{entries.map(({ patch, index }) => <div key={`${patch.patchId || patch.op}-${index}`} className="flex items-center gap-2.5 border-b px-3 py-2 last:border-0"><span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-xs font-extrabold ${toneFor(patch)}`}>{markerFor(patch)}</span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold text-slate-800">{titleFor(patch)}</span><span className="block truncate text-[11px] text-slate-500">{detailFor(patch)}</span></span><Check size={14} className="shrink-0 text-emerald-600" /></div>)}</div></div>)}</div></div>}
        {proposal?.work && <div className="border-t border-slate-100 bg-slate-50/40 px-4 py-3"><AssistantWorkDetails work={proposal.work} tokenUsage={tokenUsage} /></div>}
    </section>;

    if (isStale) return <section className="mt-2 w-full overflow-hidden rounded-2xl border border-amber-200 bg-white shadow-sm shadow-amber-900/5">
        <div className="flex items-center gap-3 px-4 py-3.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-amber-200 bg-amber-50 text-amber-700"><X size={17} strokeWidth={3} /></span>
            <span className="min-w-0 flex-1"><span className="block text-[10px] font-extrabold uppercase tracking-[0.14em] text-amber-700">{isReplaced ? 'Proposal replaced' : 'Proposal outdated'}</span><span className="mt-0.5 block truncate text-sm font-extrabold text-slate-900">{proposal?.schema?.title || 'Form changes'}</span><span className="mt-0.5 block text-xs text-slate-500">{isReplaced ? 'A newer proposal replaced this one.' : 'Generate a new suggestion before applying changes.'}</span></span>
        </div>
        {proposal?.work && <div className="border-t border-slate-100 bg-slate-50/40 px-4 py-3"><AssistantWorkDetails work={proposal.work} tokenUsage={tokenUsage} /></div>}
    </section>;

    return <section className={`w-full overflow-hidden rounded-2xl border bg-white shadow-sm shadow-slate-900/5 ${isRejected ? 'border-slate-200' : 'border-violet-100'}`}>
        <div className={`border-b px-4 py-3.5 ${isRejected ? 'border-slate-200 bg-slate-50/80' : 'border-violet-100 bg-violet-50/45'}`}>
            <div className="flex items-start justify-between gap-3"><div><p className={`text-[10px] font-extrabold uppercase tracking-[0.15em] ${isRejected ? 'text-slate-600' : 'text-violet-700'}`}>{isRejected ? 'Proposal ignored' : 'Review form changes'}</p><h3 className="mt-1 text-sm font-extrabold text-slate-900">{proposal?.schema?.title || 'Untitled form'}</h3></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${isRejected ? 'bg-slate-200 text-slate-700' : isUnverified ? 'bg-amber-100 text-amber-800' : locked ? 'bg-slate-100 text-slate-600' : 'bg-violet-600 text-white'}`}>{isRejected ? 'Ignored' : isUnverified ? 'Review carefully' : locked ? 'Locked' : 'Ready to review'}</span></div>
            <p className="mt-1.5 text-xs leading-5 text-slate-600">{isRejected ? 'No form changes were applied. The proposed fields and plan are kept here for reference.' : summary || `${patches.length} changes prepared for this form.`}</p>
            <div className="mt-3 flex flex-wrap gap-1.5"><span className="rounded-full border border-violet-200 bg-white px-2 py-1 text-[10px] font-bold text-violet-800">{patches.filter(patch => patch.op === 'add').length} added</span><span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-700">{patches.filter(patch => ['update', 'update_meta'].includes(patch.op)).length} updated</span>{patches.some(patch => patch.op === 'remove') && <span className="rounded-full border border-rose-200 bg-white px-2 py-1 text-[10px] font-bold text-rose-700">{patches.filter(patch => patch.op === 'remove').length} removed</span>}</div>
        </div>

        <div className="px-4 py-3.5">
            {isUnverified && !isRejected && <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900"><strong>Final AI verification was unavailable.</strong> Local validation passed; confirm the form in preview before applying it.</div>}
            {!isAskPromptlyReview && <ProposalPlanDetails proposal={proposal} isRejected={isRejected} />}
            <div className="mb-3 flex items-center justify-between"><div><p className="text-sm font-extrabold text-slate-900">Changes</p><p className="mt-0.5 text-xs text-slate-500">{isRejected ? `${patches.length} proposed · not applied` : locked ? `${patches.length} proposed` : `${selectedCount} of ${patches.length} selected`}</p></div>{!locked && patches.length > 1 && <button type="button" onClick={() => chooseAll(selectedCount !== patches.length)} className="text-xs font-bold text-violet-700 hover:text-violet-900">{selectedCount === patches.length ? 'Clear all' : 'Select all'}</button>}</div>
            <div className="space-y-4">{Object.entries(groups).map(([group, entries]) => <div key={group}><p className="mb-1.5 text-[10px] font-extrabold uppercase tracking-[0.13em] text-slate-400">{group}</p><div className="overflow-hidden rounded-xl border border-slate-200">{entries.map(({ patch, index }) => {
                const open = Boolean(expanded[patch.patchId]); const selectedPatch = Boolean(selected[patch.patchId]); const settings = patch.op === 'update_settings' ? Object.entries(patch.updates || {}) : [];
                const details = settings.length > 0 || patch.op === 'update' || patch.op === 'move' || patch.op === 'update_meta' || patch.op === 'update_memory';
                return <div key={`${patch.patchId || patch.op}-${index}`} className={`border-b last:border-0 ${selectedPatch ? '' : 'bg-slate-50/70 opacity-60'}`}><div className="flex items-center gap-2.5 px-3 py-2.5"><input aria-label={`Include ${titleFor(patch)}`} type="checkbox" checked={selectedPatch} onChange={() => toggle(patch.patchId)} disabled={locked} className="h-4 w-4 shrink-0 rounded border-slate-300 text-violet-600 focus:ring-violet-500" /><span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-xs font-extrabold ${toneFor(patch)}`}>{markerFor(patch)}</span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold text-slate-800">{titleFor(patch)}</span><span className="block truncate text-[11px] text-slate-500">{detailFor(patch)}</span></span>{details && <button type="button" onClick={() => setExpanded(previous => ({ ...previous, [patch.patchId]: !previous[patch.patchId] }))} className="rounded-md p-1 text-slate-400 hover:bg-violet-50 hover:text-violet-700" aria-label={`${open ? 'Hide' : 'Show'} details for ${titleFor(patch)}`}>{open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</button>}</div>{open && <div className="border-t border-slate-100 bg-slate-50 px-11 py-2.5 text-[11px] leading-5 text-slate-600">{settings.length > 0 ? settings.map(([key, value]) => <div key={key} className="flex flex-wrap gap-x-1.5"><strong>{getFormSettingLabel(key)}</strong><span className="line-through text-slate-400">{formatFormSettingValue(key, patch.originalSettings?.[key])}</span><span>→</span><span className="font-bold text-slate-700">{formatFormSettingValue(key, value)}</span></div>) : patch.op === 'update_meta' ? 'The title or description will be updated in the preview.' : patch.op === 'update_memory' ? 'This preference will be used for future AI edits.' : 'The preview shows the exact before-and-after field details.'}</div>}</div>;
            })}</div></div>)}</div>
            {proposal?.work && <div className="mt-4"><AssistantWorkDetails work={proposal.work} tokenUsage={tokenUsage} defaultExpanded={isRejected} label={isRejected ? 'Preparation steps' : 'Preparation details'} /></div>}
        </div>
        {!locked && <footer className="border-t border-violet-100 bg-slate-50/60 p-3.5"><div className="flex gap-2"><Button variant="ghost" size="sm" className="flex-1 whitespace-nowrap" onClick={onIgnore} isLoading={rejecting} loadingText="Ignoring…" iconLeft={<X size={15} />}>Ignore</Button>{isUnverified && <Button variant="outline" size="sm" className="flex-1 whitespace-nowrap" onClick={onRegenerate}>Generate new</Button>}<Button variant="primary" size="sm" className="flex-[1.5] whitespace-nowrap" disabled={selectedCount === 0} onClick={() => onPreview(filtered())} iconLeft={<Eye size={15} />}>Preview {selectedCount || ''} selected</Button></div></footer>}
    </section>;
}
