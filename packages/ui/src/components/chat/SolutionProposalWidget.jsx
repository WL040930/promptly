import { useEffect, useState } from 'react';
import { AlertTriangle, ArrowRight, Check, ChevronDown, ClipboardList, Eye, GitBranch, Layers3, Table2 } from 'lucide-react';
import Button from '../ui/Button.jsx';
import { AssistantWorkDetails } from './AssistantWorkCard.jsx';
import { isAcceptedProposalStatus, isRejectedProposalStatus, isStaleProposalStatus, normalizeProposalStatus, proposalSectionExpansion, proposalStatusTone } from './proposalStatus.js';
import { compoundProposalPresentation } from '../../utils/solutionProposalPresentation.js';

const fieldTypeLabel = field => String(field?.type || 'text').replace(/[-_]/g, ' ');

const statusCopy = status => {
    if (isAcceptedProposalStatus(status)) return { eyebrow: 'Solution applied', title: 'Your form and workflow are ready', description: 'Both coordinated changes were applied to your workspace.' };
    if (isRejectedProposalStatus(status)) return { eyebrow: 'Proposal discarded', title: 'No changes were applied', description: 'This solution remains here for reference, but it is no longer actionable.' };
    if (isStaleProposalStatus(status)) return { eyebrow: normalizeProposalStatus(status) === 'superseded' ? 'Proposal replaced' : 'Proposal outdated', title: 'Generate a new solution', description: 'A newer request replaced this proposal, so it cannot be applied.' };
    return { eyebrow: 'Solution proposal', title: 'Review the form and workflow', description: 'Two coordinated changes are ready. Review each part before applying the solution.' };
};

function SectionHeader({ icon: Icon, eyebrow, title, description, expanded, onToggle, tone = 'indigo' }) {
    const colors = tone === 'emerald'
        ? { icon: 'border-emerald-200 bg-emerald-50 text-emerald-700', eyebrow: 'text-emerald-700', hover: 'hover:bg-emerald-50/50' }
        : { icon: 'border-indigo-200 bg-indigo-50 text-indigo-700', eyebrow: 'text-indigo-700', hover: 'hover:bg-indigo-50/50' };
    return <button type="button" onClick={onToggle} aria-expanded={expanded} className={`flex w-full items-start gap-3 px-4 py-3.5 text-left transition ${colors.hover}`}>
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${colors.icon}`}><Icon size={17} strokeWidth={2.2} /></span>
        <span className="min-w-0 flex-1">
            <span className={`block text-[10px] font-extrabold uppercase tracking-[0.14em] ${colors.eyebrow}`}>{eyebrow}</span>
            <span className="mt-1 block text-sm font-extrabold text-slate-900">{title}</span>
            <span className="mt-1 block text-xs leading-5 text-slate-500">{description}</span>
        </span>
        <ChevronDown size={17} className={`mt-1 shrink-0 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
    </button>;
}

function FlowPreview({ flow }) {
    if (flow.length === 0) return <p className="text-xs leading-5 text-slate-500">The workflow graph is included in the preview.</p>;
    return <div className="flex min-w-0 items-center gap-2 overflow-x-auto pb-1">
        {flow.map((step, index) => <span key={`${step}-${index}`} className="flex min-w-max items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-bold text-slate-700 shadow-sm">
                <span className="flex h-5 w-5 items-center justify-center rounded-md bg-indigo-50 text-[10px] font-extrabold text-indigo-700">{index + 1}</span>
                {step}
            </span>
            {index < flow.length - 1 && <ArrowRight size={14} className="shrink-0 text-indigo-400" aria-hidden="true" />}
        </span>)}
    </div>;
}

export default function SolutionProposalWidget({ proposal, status, summary, tokenUsage, onAccept, onIgnore, onPreviewForm, onPreviewWorkflow, accepting, rejecting }) {
    const presentation = compoundProposalPresentation(proposal);
    const terminal = isAcceptedProposalStatus(status) || isRejectedProposalStatus(status) || isStaleProposalStatus(status);
    const [expanded, setExpanded] = useState(() => proposalSectionExpansion(status));
    const copy = statusCopy(status);
    const terminalTone = proposalStatusTone(status);
    const verificationUnverified = proposal?.verification?.status === 'unverified';
    const readinessIssues = presentation.workflowReadiness?.issues || [];
    const hasForm = Boolean(presentation.form);
    const hasWorkflow = Boolean(presentation.workflow);

    useEffect(() => {
        if (terminal) setExpanded(proposalSectionExpansion(status));
    }, [status, terminal]);

    return <section className={`mt-2 w-full overflow-hidden rounded-[22px] border bg-white shadow-[0_12px_35px_rgba(58,34,118,0.08)] ${terminalTone?.card || 'border-indigo-200/80'}`}>
        <header className={`border-b px-4 py-4 ${terminalTone?.header || 'border-indigo-100 bg-[#f8f8ff]'}`}>
            <div className="flex items-start gap-3">
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border ${terminalTone?.icon || 'border-indigo-200 bg-indigo-100 text-indigo-700'}`}><Layers3 size={18} strokeWidth={2.2} /></span>
                <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <p className={`text-[10px] font-extrabold uppercase tracking-[0.16em] ${terminalTone?.eyebrow || 'text-indigo-700'}`}>{copy.eyebrow}</p>
                            <h3 className="mt-1 text-base font-extrabold tracking-tight text-slate-900">{copy.title}</h3>
                        </div>
                        <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold ${terminalTone?.badge || 'border-indigo-200 bg-white text-indigo-700'}`}>
                            {isAcceptedProposalStatus(status) ? 'Applied' : terminal ? (isRejectedProposalStatus(status) ? 'Discarded' : 'Outdated') : 'Ready to review'}
                        </span>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-slate-600">{summary || copy.description}</p>
                </div>
            </div>
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-indigo-100 bg-white/80 px-3 py-2.5 text-xs font-bold text-slate-700">
                <span className="text-indigo-700">What will happen</span>
                <ArrowRight size={14} className="text-slate-400" aria-hidden="true" />
                <span>Form submission</span>
                <ArrowRight size={14} className="text-slate-400" aria-hidden="true" />
                <span>Workflow actions</span>
            </div>
        </header>

        <div className="space-y-3 p-3.5">
            {verificationUnverified && !terminal && <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2.5 text-xs leading-5 text-amber-900"><AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-600" /><span><strong>Review carefully.</strong> Final verification was unavailable, so confirm both previews before applying.</span></div>}

            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/45">
                <SectionHeader
                    icon={ClipboardList}
                    eyebrow="Form"
                    title={presentation.formTitle}
                    description={presentation.form?.action === 'edit_form' ? 'Update the selected form and keep its existing responses.' : 'Create the form that will collect each submission.'}
                    expanded={expanded.form}
                    onToggle={() => setExpanded(value => ({ ...value, form: !value.form }))}
                />
                {expanded.form && <div className="border-t border-slate-200 bg-white px-4 py-3.5">
                    <div className="mb-3 flex items-center justify-between gap-3"><div><p className="text-xs font-extrabold text-slate-800">Questions in the form</p><p className="mt-0.5 text-[11px] text-slate-500">{presentation.formFields.length || 0} questions prepared</p></div><span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-bold text-slate-600">{hasForm ? 'Included' : 'Needs review'}</span></div>
                    {presentation.formFields.length > 0 ? <div className="overflow-hidden rounded-xl border border-slate-200">{presentation.formFields.slice(0, 6).map((field, index) => <div key={field.id || `${field.label}-${index}`} className="flex items-center gap-2.5 border-b border-slate-100 px-3 py-2.5 last:border-0"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-100 text-[10px] font-extrabold text-slate-500">{index + 1}</span><span className="min-w-0 flex-1 truncate text-xs font-bold text-slate-700">{field.label || 'Untitled question'}</span><span className="shrink-0 text-[10px] font-semibold capitalize text-slate-400">{fieldTypeLabel(field)}</span></div>)}{presentation.formFields.length > 6 && <div className="border-t border-slate-100 bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-500">+ {presentation.formFields.length - 6} more questions</div>}</div> : <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-xs text-slate-500">Form details are available in the full preview.</div>}
                    {!terminal && hasForm && <div className="mt-3 flex justify-end"><Button type="button" variant="outline" size="sm" onClick={() => onPreviewForm?.(presentation.form)} iconLeft={<Eye size={14} />}>View form preview</Button></div>}
                </div>}
            </section>

            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/45">
                <SectionHeader
                    icon={GitBranch}
                    eyebrow="Workflow"
                    title={presentation.workflowTitle}
                    description="Run these actions after a form submission, in the order shown below."
                    expanded={expanded.workflow}
                    onToggle={() => setExpanded(value => ({ ...value, workflow: !value.workflow }))}
                />
                {expanded.workflow && <div className="border-t border-slate-200 bg-white px-4 py-3.5">
                    <div className="mb-3 flex items-center justify-between gap-3"><div><p className="text-xs font-extrabold text-slate-800">Workflow sequence</p><p className="mt-0.5 text-[11px] text-slate-500">{presentation.workflowNodes.length || presentation.flow.length || 0} steps prepared</p></div><span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-bold text-slate-600">{hasWorkflow ? 'Included' : 'Needs review'}</span></div>
                    <FlowPreview flow={presentation.flow} />
                    {presentation.resourceChanges.length > 0 && <div className="mt-3 rounded-xl border border-sky-100 bg-sky-50/55 px-3 py-2.5"><p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-[0.12em] text-sky-800"><Table2 size={13} />Workspace resources</p>{presentation.resourceChanges.slice(0, 4).map((change, index) => <div key={change.id || `${change.label || change.type}-${index}`} className="text-xs leading-5 text-sky-950"><span className="font-bold">{change.displayLabel || change.label || change.name || change.type || 'Resource'}</span>{change.displayDetail ? <span className="ml-1 text-sky-800">— {change.displayDetail}</span> : null}</div>)}</div>}
                    {readinessIssues.length > 0 && !terminal && <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2.5 text-xs leading-5 text-amber-900"><p className="font-bold">Setup may be needed</p>{readinessIssues.slice(0, 3).map((issue, index) => <p key={`${issue.code || 'issue'}-${index}`} className="mt-1">• {issue.message || issue}</p>)}</div>}
                    {!terminal && hasWorkflow && <div className="mt-3 flex justify-end"><Button type="button" variant="outline" size="sm" onClick={() => onPreviewWorkflow?.(presentation.workflowPreview)} iconLeft={<Eye size={14} />}>View workflow preview</Button></div>}
                </div>}
            </section>

            {proposal?.work && <AssistantWorkDetails work={proposal.work} tokenUsage={tokenUsage} defaultExpanded={!terminal} label="Preparation details" />}
        </div>

        {!terminal && <footer className="border-t border-indigo-100 bg-slate-50/70 p-3.5"><p className="mb-3 text-[11px] leading-4 text-slate-500">Nothing changes until you apply this solution. You can inspect the form and workflow separately first.</p><div className="flex flex-col gap-2 sm:flex-row"><Button type="button" variant="outline" size="action" className="flex-1 !rounded-xl" onClick={onIgnore} isLoading={rejecting} disabled={accepting} loadingText="Discarding…">Discard proposal</Button><Button type="button" variant="primary" size="action" className="flex-[1.5] !rounded-xl" onClick={onAccept} isLoading={accepting} disabled={rejecting} loadingText="Applying solution…" iconLeft={<Check size={15} />}>Apply solution</Button></div></footer>}
    </section>;
}
