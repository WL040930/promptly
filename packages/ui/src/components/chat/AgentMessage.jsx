import Button from '../ui/Button.jsx';
import FormProposalWidget from './FormProposalWidget.jsx';
import WorkflowProposalWidget from './WorkflowProposalWidget.jsx';
import MarkdownRenderer from '../ui/MarkdownRenderer.jsx';
import MessageOptionsWidget from './MessageOptionsWidget.jsx';
import AssistantFailureCard from './AssistantFailureCard.jsx';
import AssistantWorkCard from './AssistantWorkCard.jsx';
import { proposalStatusLabel, shouldShowProposalActions } from './proposalStatus.js';
import { messagePresentation } from './messagePresentation.js';
import { AlertTriangle, CheckCircle2, Copy, GitBranch, LoaderCircle, ShieldAlert, Trash2, Zap } from 'lucide-react';

const formatTokens = (value) => (value || 0).toLocaleString();

const TokenUsageBreakdown = ({ tokenUsage }) => {
    const stages = Object.entries(tokenUsage.stages || {});

    return (
        <div className="relative flex justify-end px-3.5 pb-3.5">
            <span
                tabIndex="0"
                aria-label="Show token usage breakdown"
                className="group relative inline-flex cursor-help items-center text-[10px] font-medium text-slate-400 outline-none focus-visible:text-slate-600"
            >
                <Zap size={11} strokeWidth={2.5} className="mr-1 text-yellow-500" />
                {formatTokens(tokenUsage.totalTokens)} tokens
                <span
                    role="tooltip"
                    className="pointer-events-none absolute bottom-full right-0 z-50 mb-2 hidden w-64 rounded-lg border border-slate-200 bg-white p-3 text-left text-[11px] text-slate-600 shadow-xl group-hover:block group-focus:block"
                >
                    <span className="mb-2 block text-xs font-semibold text-slate-800">Token usage</span>
                    <span className="flex items-center justify-between">
                        <span>Prompt</span>
                        <span className="font-medium text-slate-800">{formatTokens(tokenUsage.promptTokens)}</span>
                    </span>
                    <span className="flex items-center justify-between">
                        <span>Output</span>
                        <span className="font-medium text-slate-800">{formatTokens(tokenUsage.completionTokens)}</span>
                    </span>
                    {stages.length > 0 && (
                        <span className="mt-2 block border-t border-slate-100 pt-2">
                            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Stages</span>
                            {stages.map(([stage, usage]) => (
                                <span key={stage} className="flex items-center justify-between gap-3 py-0.5">
                                    <span className="truncate">{stage}{usage.calls > 1 ? ` (${usage.calls} calls)` : ''}</span>
                                    <span className="shrink-0 font-medium text-slate-800">{formatTokens(usage.totalTokens)}</span>
                                </span>
                            ))}
                        </span>
                    )}
                </span>
            </span>
        </div>
    );
};

export default function AgentMessage({ message, onApply, onIgnore, onOption, onRecoveryAction, isTyping, isAccepting, isRejecting, isLatest = true }) {
    const payload = message.payload || message.proposal || {};
    const isProposal = message.proposal != null || ['solution_proposal', 'workflow_proposal', 'workflow_diff', 'form_proposal', 'form_duplicate_proposal', 'form_delete_proposal', 'form_bulk_delete_proposal', 'form_response_clear_proposal'].includes(message.kind);
    const rawStatus = message.proposalStatus || payload.status;
    const status = proposalStatusLabel(rawStatus);
    const showProposalActions = shouldShowProposalActions(rawStatus);
    const clarification = (message.options && !Array.isArray(message.options)) ? message.options : null;
    const options = Array.isArray(message.options)
        ? message.options
        : (clarification?.inputs || payload.options || []);
    const selectedState = clarification?.selectedState || payload.selectedState || {};
    const kind = message.kind || (message.proposal ? 'form_proposal' : (options.length > 0 ? 'clarification' : 'text'));
    const isClarification = kind === 'clarification' && options.length > 0;
    const work = message.sender === 'bot' ? payload.work : null;
    const isFormProposal = message.sender !== 'user' && kind === 'form_proposal';
    const presentation = messagePresentation(message);
    const isCompactWork = presentation === 'work';
    const isProposalWork = presentation === 'proposal_work';
    const isWorkMessage = isCompactWork || isProposalWork;
    const workLabel = work?.activities?.find(activity => activity.status === 'active')?.label
        || work?.activities?.at(-1)?.label
        || 'Thinking';
    const planSteps = Array.isArray(payload.plan) ? payload.plan : (Array.isArray(payload.plan?.outcomes) ? payload.plan.outcomes : (Array.isArray(payload.plan?.steps) ? payload.plan.steps : []));
    const planSummary = typeof payload.plan?.summary === 'string' ? payload.plan.summary : null;
    const planAssumptions = Array.isArray(payload.plan?.assumptions) ? payload.plan.assumptions : [];
    const isDeleteProposal = message.kind === 'form_delete_proposal';
    const isBulkDeleteProposal = message.kind === 'form_bulk_delete_proposal';
    const isDuplicateProposal = message.kind === 'form_duplicate_proposal';
    const isResponseClearProposal = message.kind === 'form_response_clear_proposal';
    const proposalTitle = message.kind === 'solution_proposal'
        ? 'Solution proposal'
        : message.kind === 'workflow_diff'
            ? 'Workflow changes'
            : isBulkDeleteProposal
                ? 'Delete all forms'
                : isDeleteProposal
                    ? 'Delete form'
                    : isDuplicateProposal
                        ? 'Duplicate form'
                        : isResponseClearProposal
                            ? 'Clear form responses'
                            : 'Workflow proposal';
    const ProposalIcon = message.kind === 'solution_proposal' || message.kind === 'workflow_diff' || message.kind === 'workflow_proposal'
        ? GitBranch
        : isDeleteProposal || isBulkDeleteProposal
            ? Trash2
            : isDuplicateProposal
                ? Copy
                : ShieldAlert;
    const proposalTone = isDeleteProposal || isBulkDeleteProposal
        ? {
            card: 'border-red-200/80 bg-white shadow-sm shadow-red-900/5',
            header: 'border-red-100 bg-red-50/70',
            icon: 'bg-red-100 text-red-600 border-red-200',
            eyebrow: 'text-red-700',
            badge: 'border-amber-200 bg-amber-50 text-amber-700'
        }
        : {
            card: 'border-indigo-100 bg-white shadow-sm shadow-slate-900/5',
            header: 'border-indigo-100 bg-indigo-50/60',
            icon: 'bg-indigo-100 text-indigo-600 border-indigo-200',
            eyebrow: 'text-indigo-700',
            badge: 'border-indigo-200 bg-white text-indigo-700'
        };

    return (
        <div className={`flex w-full ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
            {message.sender !== 'user' && !isWorkMessage && (
                <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 shrink-0 mt-4 mr-2.5 shadow-sm border border-indigo-200/50">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="14" x="3" y="8" rx="2" /><path d="M12 5a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" /><path d="M12 5v3" /><path d="M8 14h.01" /><path d="M16 14h.01" /><path d="M9 19h6" /></svg>
                </div>
            )}
            <div className={`flex min-w-0 flex-col gap-1 ${message.sender === 'user' ? 'max-w-[90%] items-end' : isProposalWork ? 'w-full max-w-4xl items-start' : 'max-w-[90%] items-start'}`}>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-1">
                    {message.sender === 'user' ? 'You' : 'Promptly AI'}
                </span>
                {isProposalWork ? (
                    <AssistantWorkCard work={work} tokenUsage={message.tokenUsage} />
                ) : isCompactWork ? (
                    <div className="inline-flex items-center gap-2 rounded-2xl rounded-tl-none border border-slate-200/70 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-500 shadow-sm" role="status" aria-label="Promptly is working">
                        <LoaderCircle size={14} className="animate-spin text-violet-600" />
                        <span>{workLabel}…</span>
                    </div>
                ) : message.sender !== 'user' && (message.isError || kind === 'error') ? (
                    <AssistantFailureCard message={message} onAction={onRecoveryAction} isWorking={isTyping} />
                ) : kind === 'assistant_work' || isFormProposal || isClarification ? null : (
                    <div className={`relative w-full min-w-0 rounded-2xl ${message.sender === 'user' ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-white text-slate-800 rounded-tl-none border border-slate-200/60 shadow-sm'}`}>
                        <div className="w-full min-w-0 overflow-x-auto p-3.5 text-sm leading-relaxed">
                            {message.sender === 'user' ? (
                                <div className="whitespace-pre-wrap text-white/90">{message.text}</div>
                            ) : (
                                <MarkdownRenderer content={message.text} />
                            )}
                        </div>
                        {message.tokenUsage && <TokenUsageBreakdown tokenUsage={message.tokenUsage} />}
                    </div>
                )}

                {message.sender !== 'user' && kind === 'agent_plan_review' && (
                    <div className="w-full rounded-xl border border-indigo-100 bg-indigo-50/60 px-3 py-3 text-xs text-slate-600">
                        <div className="mb-1 font-semibold text-slate-800">Plan for review</div>
                        {planSummary && <div className="mb-2 text-slate-600">{planSummary}</div>}
                        {planSteps.length > 0 && (
                            <div className="mb-3 flex flex-col gap-1">
                                {planSteps.map((step, index) => (
                                    <div key={step.id || `${step.title || step.type}-${index}`} className="flex gap-2">
                                        <span className="font-semibold text-indigo-600">{index + 1}.</span>
                                        <span>{step.title || step.reason || step.type}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                        {planAssumptions.length > 0 && (
                            <div className="mb-3 rounded-lg border border-amber-100 bg-amber-50/60 px-2.5 py-2 text-amber-800">
                                <div className="mb-1 font-semibold">Assumptions</div>
                                {planAssumptions.map((assumption, index) => <div key={`${assumption}-${index}`}>• {assumption}</div>)}
                            </div>
                        )}
                        <div className="flex gap-2">
                            <Button
                                variant="primary"
                                size="sm"
                                className="flex-1"
                                onClick={() => onOption?.({ type: 'agent_plan_approved', runId: payload.runId })}
                                disabled={!payload.runId || isTyping}
                            >
                                Proceed
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                className="flex-1"
                                onClick={() => onOption?.({ type: 'agent_plan_rejected', runId: payload.runId })}
                                disabled={!payload.runId || isTyping}
                            >
                                Cancel
                            </Button>
                        </div>
                    </div>
                )}

                {isClarification && (
                    <MessageOptionsWidget
                        message={message.text}
                        options={options}
                        allowDecide={clarification?.allowDecide === true || payload.allowDecide === true}
                        clarificationId={clarification?.clarificationId || clarification?.id || payload.clarificationId}
                        onSend={(selected) => onOption?.(selected)}
                        isTyping={isTyping}
                        isResolved={!isLatest || Object.keys(selectedState).length > 0}
                        initialState={selectedState}
                        resolution={clarification?.resolution || payload.resolution}
                    />
                )}

                {isProposal && kind === 'form_proposal' && (
                    <FormProposalWidget
                        proposal={payload}
                        status={status}
                        summary={message.text}
                        tokenUsage={message.tokenUsage}
                        onAccept={(filteredSchema, selectedPatchIds) => onApply?.(message, filteredSchema, selectedPatchIds)}
                        onIgnore={() => onIgnore?.(message)}
                        onPreview={(filteredProposal) => onOption?.({ type: 'preview_form', proposal: { ...(filteredProposal || payload), messageId: message.id }, formId: payload.formId })}
                        onPreviewUpdate={(filteredProposal) => onOption?.({ type: 'preview_update', proposal: filteredProposal, formId: payload.formId })}
                        onRegenerate={() => onOption?.({ type: 'regenerate_proposal', text: payload.work?.title || message.text || '' })}
                        accepting={isAccepting}
                        rejecting={isRejecting}
                    />
                )}

                {isProposal && (kind === 'workflow_proposal' || kind === 'workflow_diff') && (
                    <WorkflowProposalWidget
                        proposal={payload}
                        status={status}
                        tokenUsage={message.tokenUsage}
                        onAccept={() => onApply?.(message)}
                        onIgnore={() => onIgnore?.(message)}
                        onPreview={() => onOption?.({ type: 'preview_workflow', proposal: { ...payload, messageId: message.id }, workflowId: payload.workflowId })}
                        onSetupAction={action => onRecoveryAction?.(action, message)}
                        onRegenerate={() => onOption?.({ type: 'regenerate_proposal', text: payload.work?.title || message.text || '' })}
                        accepting={isAccepting}
                        rejecting={isRejecting}
                    />
                )}

                {isProposal && !['form_proposal', 'workflow_proposal', 'workflow_diff'].includes(kind) && (
                    <div className={`mt-2 w-full overflow-hidden rounded-2xl border flex flex-col ${proposalTone.card}`}>
                        <div className={`flex items-start gap-3 border-b px-4 py-3 ${proposalTone.header}`}>
                            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${proposalTone.icon}`}>
                                <ProposalIcon size={16} strokeWidth={2.25} />
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className={`text-[10px] font-extrabold uppercase tracking-[0.14em] ${proposalTone.eyebrow}`}>
                                    {proposalTitle}
                                </div>
                                <div className="mt-1 text-xs leading-5 text-slate-500">
                                    {isBulkDeleteProposal ? 'Review every form before permanently deleting them.' : isDeleteProposal ? 'Review the details before permanently deleting this form.' : 'Review the proposed changes before applying them.'}
                                </div>
                            </div>
                            <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold ${!showProposalActions ? 'border-slate-200 bg-white text-slate-500' : proposalTone.badge}`}>
                                {!showProposalActions ? status : 'Awaiting approval'}
                            </span>
                        </div>
                        <div className="flex flex-col gap-3 p-4">
                            {message.kind === 'solution_proposal' && (
                                <div className="flex flex-col gap-1">
                                    {planSteps.map((item, index) => <div key={`${item.subType || item.id || item.type}-${index}`} className="text-xs text-slate-600"><span className="font-bold text-slate-800">{item.title || item.type}</span>{item.reason || item.description ? ` — ${item.reason || item.description}` : ''}</div>)}
                                    {(payload.solution || []).map(artifact => (
                                        <div key={artifact.id || artifact.type} className="text-xs text-slate-600">
                                            <span className="font-bold text-slate-800">{artifact.type === 'form_proposal' ? 'Form' : artifact.type === 'workflow_proposal' ? 'Workflow' : artifact.type}</span>
                                            {' '}is included in this bundle.
                                        </div>
                                    ))}
                                    {payload.needsForm && <div className="text-xs font-semibold text-orange-700">A form will be created before this workflow can run.</div>}
                                    {payload.readiness && (
                                        <div className={`mt-2 rounded-xl border px-3 py-2.5 text-xs ${payload.readiness.ready ? 'border-emerald-200 bg-emerald-50/70 text-emerald-800' : 'border-amber-200 bg-amber-50/70 text-amber-900'}`}>
                                            <div className="font-bold">{payload.readiness.ready ? 'Ready to test' : 'Setup needed before testing'}</div>
                                            {!payload.readiness.ready && (payload.readiness.issues || []).slice(0, 3).map((item, index) => <div key={`${item.code || 'issue'}-${index}`} className="mt-1 leading-4">• {item.message}</div>)}
                                        </div>
                                    )}
                                </div>
                            )}
                            {['form_delete_proposal', 'form_bulk_delete_proposal', 'form_duplicate_proposal', 'form_response_clear_proposal'].includes(message.kind) && (
                                <div className="flex flex-col gap-3">
                                    <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-3">
                                        {isBulkDeleteProposal ? (
                                            <>
                                                <div className="text-sm font-bold text-slate-800">{payload.formCount || payload.forms?.length || 0} forms selected</div>
                                                <div className="mt-2 max-h-36 overflow-y-auto border-t border-slate-200/80 pt-2 text-xs text-slate-600">
                                                    {(payload.forms || []).map(form => <div key={form.id} className="flex items-center justify-between gap-3 py-1"><span className="truncate">{form.title || form.id}</span><span className="shrink-0 text-slate-400">{form.responseCount || 0} responses</span></div>)}
                                                </div>
                                            </>
                                        ) : (
                                            <>
                                                {payload.title && <div className="text-sm font-bold text-slate-800">{payload.title}</div>}
                                                {payload.sourceTitle && <div className="mt-1 text-xs text-slate-500">Copy of {payload.sourceTitle}</div>}
                                            </>
                                        )}
                                        {payload.responseCount !== undefined && !isBulkDeleteProposal && (
                                            <div className="mt-3 flex items-center justify-between border-t border-slate-200/80 pt-2.5 text-xs">
                                                <span className="text-slate-500">Responses affected</span>
                                                <span className="font-bold text-slate-800">{payload.responseCount}</span>
                                            </div>
                                        )}
                                        {isBulkDeleteProposal && payload.totalResponseCount !== undefined && <div className="mt-3 flex items-center justify-between border-t border-slate-200/80 pt-2.5 text-xs"><span className="text-slate-500">Total responses affected</span><span className="font-bold text-slate-800">{payload.totalResponseCount}</span></div>}
                                    </div>
                                    {payload.permanent && (
                                        <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50/70 px-3.5 py-3 text-xs leading-5 text-red-800">
                                            <AlertTriangle size={15} className="mt-0.5 shrink-0 text-red-600" />
                                            <span><span className="font-bold">Permanent deletion.</span> These forms and their responses cannot be recovered.</span>
                                        </div>
                                    )}
                                </div>
                            )}
                            {!showProposalActions ? (
                                <div className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-bold ${status === 'Applied' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-500'}`}>
                                    {status === 'Applied' ? <CheckCircle2 size={14} /> : null}
                                    {status}
                                </div>
                            ) : (
                                <div className="flex flex-col gap-2 border-t border-slate-100 pt-3 sm:flex-row">
                                    <Button
                                        variant={isDeleteProposal || isBulkDeleteProposal ? 'dangerSolid' : 'primary'}
                                        size="action"
                                        className="!rounded-xl flex-1"
                                        onClick={() => onApply?.(message)}
                                        isLoading={isAccepting}
                                        disabled={isRejecting}
                                        loadingText={isBulkDeleteProposal ? 'Deleting forms…' : isDeleteProposal ? 'Deleting…' : 'Applying…'}
                                    >
                                        {isBulkDeleteProposal ? 'Delete all forms' : isDeleteProposal ? 'Delete form' : 'Apply'}
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="action"
                                        className="!rounded-xl flex-1"
                                        onClick={() => onIgnore?.(message)}
                                        isLoading={isRejecting}
                                        disabled={isAccepting}
                                        loadingText={isBulkDeleteProposal ? 'Keeping forms…' : isDeleteProposal ? 'Keeping…' : 'Ignoring…'}
                                    >
                                        {isBulkDeleteProposal ? 'Keep forms' : isDeleteProposal ? 'Keep form' : 'Ignore'}
                                    </Button>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
