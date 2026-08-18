import { useState, useRef, useEffect } from 'react';
import { useFormAIAssistant } from '../hooks/useFormAIAssistant';
import FormDiffPreviewModal from './FormDiffPreviewModal';
import GenericChatWidget from '../../components/chat/GenericChatWidget.jsx';
import ClarificationModeSelect from '../../components/chat/ClarificationModeSelect.jsx';
import ConfirmModal from '../../components/modals/ConfirmModal.jsx';
import { navigateTo } from '../../utils/router.js';

const SUGGESTIONS = [
    "A customer satisfaction survey",
    "An event registration form",
    "A job application form",
    "A product feedback questionnaire"
];

const FormAIAssistant = ({ form, onBeforeSend, onFormApplied }) => {
    const {
        messages,
        input,
        setInput,
        clarificationMode,
        setClarificationMode,
        isTyping,
        isLoadingHistory,
        hasMore,
        loadMoreHistory,
        handleSend,
        handleAcceptProposal,
        handleRejectProposal,
        handleRecoveryAction,
        pendingFormDeletionReview,
        closeFormDeletionReview,
        confirmFormDeletionReview,
        acceptingProposalId,
        rejectingProposalId,
        clearChat,
        isClearingChat
    } = useFormAIAssistant(form, { onBeforeSend, onFormApplied });

    const [previewProposal, setPreviewProposal] = useState(null);
    const prevAcceptingIdRef = useRef(acceptingProposalId);

    useEffect(() => {
        // Close modal when accepting finishes (goes from truthy to falsy)
        if (prevAcceptingIdRef.current && !acceptingProposalId && previewProposal) {
            setPreviewProposal(null);
        }
        prevAcceptingIdRef.current = acceptingProposalId;
    }, [acceptingProposalId, previewProposal]);

    return (
        <div className="flex min-h-0 flex-col h-full bg-transparent relative overflow-hidden">
            <GenericChatWidget 
                messages={messages}
                input={input}
                setInput={setInput}
                isTyping={isTyping}
                isLoadingHistory={isLoadingHistory}
                hasMore={hasMore}
                loadMoreHistory={loadMoreHistory}
                handleSend={handleSend}
                handleApply={(msg, _filteredSchema, selectedPatchIds) => {
                    handleAcceptProposal(msg.id, selectedPatchIds);
                    setPreviewProposal(null);
                }}
                handleIgnore={(msg) => {
                    handleRejectProposal(msg.id);
                    setPreviewProposal(null);
                }}
                handleOption={(option) => {
                    if (option?.type === 'preview_form') {
                        setPreviewProposal(option.proposal);
                    } else if (option?.type === 'preview_update') {
                        setPreviewProposal(prev => {
                            if (prev && prev.formId === option.proposal.formId) {
                                return { ...option.proposal, messageId: prev.messageId };
                            }
                            return prev;
                        });
                    } else if (option?.type === 'regenerate_proposal') {
                        handleSend(option.text);
                    } else {
                        handleSend(option);
                    }
                }}
                onRecoveryAction={handleRecoveryAction}
                acceptingProposalId={acceptingProposalId}
                rejectingProposalId={rejectingProposalId}
                inputAccessory={<ClarificationModeSelect value={clarificationMode} onChange={setClarificationMode} />}
                placeholder="Ask AI to build or modify form..."
                suggestions={SUGGESTIONS}
                bottomNotice="AI can make mistakes. Please verify."
                onClearChat={clearChat}
                isClearingChat={isClearingChat}
                clearChatLabel="Clear form chat"
            />
            <FormDiffPreviewModal
                isOpen={!!previewProposal}
                onClose={() => setPreviewProposal(null)}
                currentForm={form}
                proposal={previewProposal}
                onApply={() => {
                    if (previewProposal?.messageId) {
                        handleAcceptProposal(previewProposal.messageId, previewProposal.selectedPatchIds || null);
                    }
                }}
                isApplying={acceptingProposalId === previewProposal?.messageId}
            />
            <ConfirmModal
                isOpen={Boolean(pendingFormDeletionReview)}
                onClose={closeFormDeletionReview}
                onConfirm={pendingFormDeletionReview?.preview?.canApply ? confirmFormDeletionReview : closeFormDeletionReview}
                title={pendingFormDeletionReview?.preview?.canApply
                    ? 'Review form field deletion'
                    : pendingFormDeletionReview?.preview?.liveBlockers?.length > 0 ? 'Form field deletion is blocked' : 'Form field deletion needs repair'}
                message={pendingFormDeletionReview?.preview?.canApply
                    ? 'Some workflow inputs use a field being removed. Confirm to clear only those references and save the form change.'
                    : pendingFormDeletionReview?.preview?.liveBlockers?.length > 0
                        ? 'A published workflow still uses this field. Repair and publish that workflow before applying the form change.'
                        : 'A workflow contains a malformed reference to this field. Repair that draft before applying the form change.'}
                confirmText={pendingFormDeletionReview?.preview?.canApply ? 'Apply and repair' : 'Close'}
                confirmVariant={pendingFormDeletionReview?.preview?.canApply ? 'danger' : 'soft'}
                isLoading={acceptingProposalId === pendingFormDeletionReview?.messageId}
            >
                <div className="space-y-3 text-xs text-slate-600">
                    {pendingFormDeletionReview?.preview?.liveBlockers?.length > 0 && (
                        <div className="space-y-1.5">
                            <p className="font-bold text-slate-800">Workflows to repair first</p>
                            {pendingFormDeletionReview.preview.liveBlockers.map(workflow => (
                                <button
                                    key={workflow.workflowId}
                                    type="button"
                                    className="flex w-full items-center justify-between rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-left text-red-800 hover:bg-red-100"
                                    onClick={() => navigateTo({ page: 'automation-build', automationId: workflow.workflowId, editor: 'visual' })}
                                >
                                    <span className="font-semibold">{workflow.workflowName}</span>
                                    <span className="text-[10px] font-bold uppercase tracking-wide">Open workflow</span>
                                </button>
                            ))}
                        </div>
                    )}
                    {pendingFormDeletionReview?.preview?.affectedWorkflows?.length > 0 && (
                        <div>
                            <p className="font-bold text-slate-800">Draft inputs that will be cleared</p>
                            <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto rounded-lg border border-amber-200 bg-amber-50 p-2">
                                {pendingFormDeletionReview.preview.affectedWorkflows.flatMap(workflow => (workflow.draft?.references || []).map(reference => ({ ...reference, workflowName: workflow.workflowName }))).map((reference, index) => (
                                    <li key={`${reference.workflowName}-${reference.nodeId}-${reference.configPath}-${index}`} className="flex items-start justify-between gap-3">
                                        <span className="min-w-0 truncate font-semibold text-slate-700">{reference.workflowName} · {reference.title || reference.nodeId}</span>
                                        <code className="shrink-0 text-[10px] text-amber-800">{reference.fieldLabel || reference.configPath}</code>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            </ConfirmModal>
        </div>
    );
};

export default FormAIAssistant;
