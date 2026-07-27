import { useState } from 'react';
import GenericChatWidget from '../../../components/chat/GenericChatWidget.jsx';
import ClarificationModeSelect from '../../../components/chat/ClarificationModeSelect.jsx';
import { getAgentProgressLabel } from '../../../../../shared/agentProgress.js';
import { useWorkflowAIAssistant } from '../../hooks/useWorkflowAIAssistant.js';
import WorkflowDiffPreviewModal from '../modals/WorkflowDiffPreviewModal.jsx';

const SUGGESTIONS = ['Add an approval step', 'Send an email after submission', 'Add a Slack notification step', 'Change a node configuration'];

export default function WorkflowAIAssistant({ workflow, onBeforeSend, initialPrompt = '' }) {
    const assistant = useWorkflowAIAssistant(workflow, { onBeforeSend, initialPrompt });
    const progressLabel = getAgentProgressLabel({ message: assistant.progressLabel }) || assistant.progressLabel;
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
                acceptingProposalId={assistant.acceptingProposalId}
                rejectingProposalId={assistant.rejectingProposalId}
                progressLabel={progressLabel}
                inputAccessory={<ClarificationModeSelect value={assistant.clarificationMode} onChange={assistant.updateClarificationMode} />}
                placeholder="Describe a change to this workflow…"
                suggestions={SUGGESTIONS}
                bottomNotice="AI can make mistakes. Please verify."
                onClearChat={assistant.clearChat}
                isClearingChat={assistant.isClearingChat}
                clearChatLabel="Clear workflow chat"
            />
            <WorkflowDiffPreviewModal
                isOpen={!!previewProposal}
                onClose={() => setPreviewProposal(null)}
                currentWorkflow={workflow}
                versionWorkflow={previewProposal}
                confirmText="Apply Changes"
                loadingText="Applying…"
                title="Review workflow changes"
                description="Compare the current workflow with the proposed changes."
                isRestoring={!!assistant.acceptingProposalId}
                onRestore={async () => {
                    // When the user clicks apply in the preview, we apply the changes
                    if (previewProposal) {
                        const message = assistant.messages.find(m => m.id === previewProposal.messageId);
                        if (message) {
                            // The handleApply call will set assistant.acceptingProposalId
                            await assistant.handleApply(message);
                        }
                    }
                    setPreviewProposal(null);
                }}
            />
        </div>
    );
}
