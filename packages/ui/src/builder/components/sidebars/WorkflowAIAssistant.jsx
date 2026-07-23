import GenericChatWidget from '../../../components/chat/GenericChatWidget.jsx';
import ClarificationModeSelect from '../../../components/chat/ClarificationModeSelect.jsx';
import { getAgentProgressLabel } from '../../../../../shared/agentProgress.js';
import { useWorkflowAIAssistant } from '../../hooks/useWorkflowAIAssistant.js';

const SUGGESTIONS = ['Add an approval step', 'Send an email after submission', 'Add a Slack notification step', 'Change a node configuration'];

export default function WorkflowAIAssistant({ workflow, onBeforeSend, initialPrompt = '' }) {
    const assistant = useWorkflowAIAssistant(workflow, { onBeforeSend, initialPrompt });
    const progressLabel = getAgentProgressLabel({ message: assistant.progressLabel }) || assistant.progressLabel;
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
                handleOption={assistant.handleOption}
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
        </div>
    );
}
