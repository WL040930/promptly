import { useState, useRef, useEffect } from 'react';
import { useFormAIAssistant } from '../hooks/useFormAIAssistant';
import FormDiffPreviewModal from './FormDiffPreviewModal';
import GenericChatWidget from '../../components/chat/GenericChatWidget.jsx';
import ClarificationModeSelect from '../../components/chat/ClarificationModeSelect.jsx';

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
        </div>
    );
};

export default FormAIAssistant;
