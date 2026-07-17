import React, { useState } from 'react';
import { useFormAIAssistant } from './hooks/useFormAIAssistant';
import FormDiffPreviewModal from './FormDiffPreviewModal';
import GenericChatWidget from '../components/chat/GenericChatWidget.jsx';

const SUGGESTIONS = [
    "A customer satisfaction survey",
    "An event registration form",
    "A job application form",
    "A product feedback questionnaire"
];

const FormAIAssistant = ({ form, accentColor = '#4f46e5' }) => {
    const {
        messages,
        input,
        setInput,
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
                        handleSend(option);
                    }
                }}
                acceptingProposalId={acceptingProposalId}
                rejectingProposalId={rejectingProposalId}
                progressLabel={progressLabel}
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
