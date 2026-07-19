import { useState } from 'react';
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

const FormAIAssistant = ({ form }) => {
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
        acceptingProposalId,
        rejectingProposalId,
        progressLabel
    } = useFormAIAssistant(form);

    const [previewProposal, setPreviewProposal] = useState(null);

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
                handleApply={(msg, _filteredSchema, unselectedIndices) => {
                    handleAcceptProposal(msg.id, unselectedIndices);
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
                                return option.proposal;
                            }
                            return prev;
                        });
                    } else {
                        if (option?.type === 'decide_for_me') {
                            handleSend('Use sensible defaults.', option);
                        } else {
                            handleSend(option);
                        }
                    }
                }}
                acceptingProposalId={acceptingProposalId}
                rejectingProposalId={rejectingProposalId}
                progressLabel={progressLabel}
                inputAccessory={<ClarificationModeSelect value={clarificationMode} onChange={setClarificationMode} />}
                placeholder="Ask AI to build or modify form..."
                suggestions={SUGGESTIONS}
                bottomNotice="AI can make mistakes. Please verify."
            />
            <FormDiffPreviewModal
                isOpen={!!previewProposal}
                onClose={() => setPreviewProposal(null)}
                currentForm={form}
                proposal={previewProposal}
            />
        </div>
    );
};

export default FormAIAssistant;
