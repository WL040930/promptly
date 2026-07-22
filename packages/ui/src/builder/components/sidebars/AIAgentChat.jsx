import { useState } from 'react';
import { useApproveAgentRun, useDecideChatProposal, useRejectAgentRun, useSendAssistantTurnStream } from '../../../api/hooks/useChat.js';
import GenericChatWidget from '../../../components/chat/GenericChatWidget.jsx';
import ClarificationModeSelect from '../../../components/chat/ClarificationModeSelect.jsx';
import { DEFAULT_CLARIFICATION_MODE } from '../../../../../shared/agentContract.js';
import { getClarificationModePreference, setClarificationModePreference } from '../../../utils/storage.js';
import { getAgentProgressLabel } from '../../../../../shared/agentProgress.js';

const SUGGESTIONS = ['Add a Slack notification step', 'Filter for high urgency tickets', 'Add GPT response step to emails', 'Store results in database'];

const initialMessage = {
    id: 'init',
    sender: 'bot',
    kind: 'text',
    text: "Hi! I'm your AI Assistant. I can help you build and configure this automation. What would you like to automate or modify?"
};

export default function AIAgentChat({ workflow, formId, onApplyProposal, onBeforeSend }) {
    const [messages, setMessages] = useState([initialMessage]);
    const [input, setInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [progressLabel, setProgressLabel] = useState('Scanning node library');
    const [sessionId, setSessionId] = useState(null);
    const [clarificationMode, setClarificationMode] = useState(() => getClarificationModePreference() || DEFAULT_CLARIFICATION_MODE);
    const [acceptingProposalId, setAcceptingProposalId] = useState(null);
    const [rejectingProposalId, setRejectingProposalId] = useState(null);
    const sendAssistantTurnMutation = useSendAssistantTurnStream();
    const approveAgentRunMutation = useApproveAgentRun();
    const rejectAgentRunMutation = useRejectAgentRun();
    const decideChatProposalMutation = useDecideChatProposal();

    const appendReply = (response) => {
        if (response?.reply) {
            const supersededMessageIds = new Set(response.reply.payload?.supersededMessageIds || []);
            setMessages(previous => [
                ...(supersededMessageIds.size > 0
                    ? previous.map(message => supersededMessageIds.has(message.id)
                        ? { ...message, proposalStatus: 'superseded' }
                        : message)
                    : previous),
                response.reply
            ]);
        }
        if (response?.sessionId) setSessionId(response.sessionId);
    };

    const send = async (text, event = null) => {
        if (!text?.trim() && !event) return;
        if (text?.trim()) setMessages(previous => [...previous, { id: `local_${Date.now()}`, sender: 'user', kind: 'text', text }]);
        setInput('');
        if (text && /form/i.test(text)) setProgressLabel('Designing form');
        else if (text && workflow?.nodes?.length && /\b(add|remove|change|modify|update|insert|delete|edit)\b/i.test(text)) setProgressLabel('Analysing current automation');
        else setProgressLabel(workflow?.nodes?.length ? 'Analysing current automation' : 'Scanning available steps');
        setIsTyping(true);
        try {
            await onBeforeSend?.();
            const response = await sendAssistantTurnMutation.mutateAsync({
                sessionId,
                message: text,
                context: {
                    surface: 'builder',
                    workflowId: workflow?.id || null,
                    formId: formId || null,
                    clarificationMode
                },
                event,
                onEvent: data => {
                    const label = getAgentProgressLabel(data);
                    if (label) setProgressLabel(label);
                }
            });
            appendReply(response);
        } catch (error) {
            setMessages(previous => [...previous, { id: `error_${Date.now()}`, sender: 'bot', kind: 'error', text: error.message || 'Sorry, I could not process that request.' }]);
        } finally {
            setIsTyping(false);
        }
    };

    const handleApply = async (message) => {
        setAcceptingProposalId(message.id);
        try {
            if (message.payload?.runId) {
                const result = await approveAgentRunMutation.mutateAsync({
                    runId: message.payload.runId,
                    idempotencyKey: `${message.payload.runId}:${message.id}`
                });
                setMessages(previous => [
                    ...previous.map(item => item.id === message.id ? { ...item, proposalStatus: 'applied' } : item),
                    ...(result.followUpReply ? [result.followUpReply] : [])
                ]);
                return;
            }
            if (['form_duplicate_proposal', 'form_delete_proposal', 'form_bulk_delete_proposal', 'form_response_clear_proposal'].includes(message.kind)) {
                const result = await decideChatProposalMutation.mutateAsync({ sessionId, messageId: message.id, action: 'approve' });
                setMessages(previous => previous.map(item => item.id === message.id
                    ? { ...item, proposalStatus: 'applied', payload: result?.message?.payload || item.payload }
                    : item));
                return;
            }
            const result = await onApplyProposal?.(message);
            setMessages(previous => previous.map(item => item.id === message.id ? { ...item, proposalStatus: 'applied' } : item));
            if (message.kind === 'form_proposal') {
                await send(null, { type: 'form_saved', messageId: message.id, formId: result?.formId || result });
            } else {
                await send(null, { type: 'proposal_applied', messageId: message.id });
            }
        } catch (error) {
            setMessages(previous => [...previous, { id: `error_${Date.now()}`, sender: 'bot', kind: 'error', text: error.message || 'The proposal could not be applied.' }]);
        } finally {
            setAcceptingProposalId(null);
        }
    };

    const handleIgnore = async (message) => {
        setRejectingProposalId(message.id);
        try {
            if (message.payload?.runId) {
                await rejectAgentRunMutation.mutateAsync(message.payload.runId);
            } else if (['solution_proposal', 'form_duplicate_proposal', 'form_delete_proposal', 'form_bulk_delete_proposal', 'form_response_clear_proposal'].includes(message.kind)) {
                await decideChatProposalMutation.mutateAsync({ sessionId, messageId: message.id, action: 'reject' });
            } else {
                await send(null, { type: 'proposal_ignored', messageId: message.id });
            }
            setMessages(previous => previous.map(item => item.id === message.id ? { ...item, proposalStatus: 'ignored' } : item));
        } catch (error) {
            setMessages(previous => [...previous, { id: `error_${Date.now()}`, sender: 'bot', kind: 'error', text: error.message || 'The proposal could not be ignored.' }]);
        } finally {
            setRejectingProposalId(null);
        }
    };

    const handleOption = (option) => {
        if (option?.type === 'agent_plan_approved' || option?.type === 'agent_plan_rejected') {
            return send(null, { type: option.type, runId: option.runId });
        }
        if (option?.id && option?.title) return send(null, { type: 'form_target_selected', formId: option.id });
        if (option?.id && option?.name) return send(null, { type: 'workflow_target_selected', workflowId: option.id });
        return send(typeof option === 'string' ? option : option?.label || option?.name || option?.title);
    };

    const handleClarificationModeChange = (mode) => {
        setClarificationMode(mode);
        setClarificationModePreference(mode);
    };

    return (
        <div className="flex min-h-0 flex-col h-full bg-white relative overflow-hidden">
            <GenericChatWidget 
                messages={messages}
                input={input}
                setInput={setInput}
                isTyping={isTyping}
                handleSend={send}
                handleApply={handleApply}
                handleIgnore={handleIgnore}
                handleOption={handleOption}
                acceptingProposalId={acceptingProposalId}
                rejectingProposalId={rejectingProposalId}
                progressLabel={progressLabel}
                inputAccessory={<ClarificationModeSelect value={clarificationMode} onChange={handleClarificationModeChange} />}
                placeholder="Describe an automation change…"
                suggestions={SUGGESTIONS}
                bottomNotice="AI can make mistakes. Please verify."
            />
        </div>
    );
}
