import { lazy, Suspense, useState } from 'react';
import GenericChatWidget from '../../../components/chat/GenericChatWidget.jsx';
import ClarificationModeSelect from '../../../components/chat/ClarificationModeSelect.jsx';
import { useWorkflowAIAssistant } from '../../hooks/useWorkflowAIAssistant.js';

const WorkflowDiffPreviewModal = lazy(() => import('../modals/WorkflowDiffPreviewModal.jsx'));

const SUGGESTIONS = ['Add an approval step', 'Send an email after submission', 'Add a Slack notification step', 'Change a node configuration'];

export default function WorkflowAIAssistant({ workflow, onBeforeSend, initialPrompt = '' }) {
    const assistant = useWorkflowAIAssistant(workflow, { onBeforeSend, initialPrompt });
    const [previewProposal, setPreviewProposal] = useState(null);
    return (
        <div className="flex min-h-0 h-full flex-col bg-white relative overflow-hidden">
            <GenericChatWidget
                messages={assistant.messages}
                input={assistant.input}
                setInput={assistant.setInput}
                isTyping={assistant.isTyping}
                isLoadingHistory={assistant.isLoadingHistory}
                handleSend={assistant.handleSend}
                handleApply={assistant.handleApply}
                handleIgnore={assistant.handleIgnore}
                handleOption={(option) => {
                    if (option?.type === 'preview_workflow') {
                        setPreviewProposal(option.proposal);
                    } else {
                        assistant.handleOption(option);
                    }
                }}
                onRecoveryAction={assistant.handleRecoveryAction}
                acceptingProposalId={assistant.acceptingProposalId}
                rejectingProposalId={assistant.rejectingProposalId}
                inputAccessory={<ClarificationModeSelect value={assistant.clarificationMode} onChange={assistant.updateClarificationMode} />}
                placeholder="Describe a change to this workflow…"
                suggestions={SUGGESTIONS}
                bottomNotice="AI can make mistakes. Please verify."
                onClearChat={assistant.clearChat}
                isClearingChat={assistant.isClearingChat}
                clearChatLabel="Clear workflow chat"
            />
            {previewProposal && (
                <Suspense fallback={null}>
                    <WorkflowDiffPreviewModal
                        isOpen
                        onClose={() => setPreviewProposal(null)}
                        currentWorkflow={workflow}
                        versionWorkflow={previewProposal}
                        confirmText="Apply Changes"
                        loadingText="Applying…"
                        title="Review workflow changes"
                        description="Compare the current workflow with the proposed changes."
                        mode="proposal"
                        canConfirm={previewProposal?.readiness?.canApply !== false}
                        confirmDisabledReason={(previewProposal?.readiness?.issues || []).map(issue => issue.message).filter(Boolean).join(' ')}
                        isRestoring={!!assistant.acceptingProposalId}
                        onRestore={async () => {
                            const message = assistant.messages.find(m => m.id === previewProposal.messageId);
                            if (message) await assistant.handleApply(message);
                            setPreviewProposal(null);
                        }}
                    />
                </Suspense>
            )}
        </div>
    );
}
