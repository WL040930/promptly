import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { useToast } from '../../context/ToastContext.jsx';
import { useApproveAgentRun, useChatSession, useChatSessions, useDecideChatProposal, useDeleteChatSession, useRejectAgentRun, useSendAssistantTurnStream } from '../../api/hooks/useChat.js';
import { useForm } from '../../api/hooks/useForms.js';
import Button from '../../components/ui/Button.jsx';
import GenericChatWidget from '../../components/chat/GenericChatWidget.jsx';
import ConfirmModal from '../../components/modals/ConfirmModal.jsx';
import FormDiffPreviewModal from '../../forms/ai/FormDiffPreviewModal.jsx';
import { navigateTo, parsePath, getQuery } from '../../utils/router.js';
import { formatCompactRelativeTime } from '../../utils/time.js';
import ChatSessionsSkeleton from '../../components/chat/ChatSessionsSkeleton.jsx';
import ClarificationModeSelect from '../../components/chat/ClarificationModeSelect.jsx';
import { DEFAULT_CLARIFICATION_MODE } from '../../../../shared/agentContract.js';
import { getClarificationModePreference, setClarificationModePreference } from '../../utils/storage.js';
import { getAgentProgressLabel } from '../../../../shared/agentProgress.js';
import { LoaderCircle } from 'lucide-react';
import { useAIActivity, useAIStream } from '../../context/AIStreamContext.jsx';
import { isDurableStreamDetachError } from '../../api/aiStream.js';
import { useDurableTurnMonitor } from '../../api/hooks/useDurableTurnMonitor.js';

const welcome = { id: 'init', sender: 'bot', kind: 'text', text: 'Hi there! I can build automations and forms from a description. What would you like to automate?' };

export default function ChatTab({ conversationId = null }) {
    const toast = useToast();
    const container = useRef(null);
    const [messages, setMessages] = useState([welcome]);
    const [sessionId, setSessionId] = useState(() => conversationId || getQuery(window.location.href).get('conversation') || parsePath(window.location.href).conversationId || null);
    const [clarificationMode, setClarificationMode] = useState(() => getClarificationModePreference() || DEFAULT_CLARIFICATION_MODE);
    const [input, setInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [progressLabel, setProgressLabel] = useState('Scanning node library');
    const [streamDetached, setStreamDetached] = useState(false);
    const [recoveryMode, setRecoveryMode] = useState(false);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [sidebarSearch, setSidebarSearch] = useState('');
    const [chatToDelete, setChatToDelete] = useState(null);
    const [previewProposal, setPreviewProposal] = useState(null);
    const [previewFormId, setPreviewFormId] = useState(null);
    const [acceptingProposalId, setAcceptingProposalId] = useState(null);
    const [rejectingProposalId, setRejectingProposalId] = useState(null);
    const activityKey = sessionId ? `ask-promptly:${sessionId}` : 'ask-promptly:new';
    const {
        isTyping: sharedIsTyping,
        progressLabel: sharedProgressLabel,
        setStreamState,
        clearStreamState
    } = useAIStream(activityKey);
    const { activeStreams } = useAIActivity();
    const askActivity = activeStreams.find(stream => stream.id === activityKey);

    const { data: sessions = [], isPending: isSessionsPending } = useChatSessions();
    const { data: session, isPending: isSessionPending, refetch: refetchSession } = useChatSession(sessionId);
    const { data: previewForm } = useForm(previewFormId);
    const sendAssistantTurnMutation = useSendAssistantTurnStream();
    const approveAgentRunMutation = useApproveAgentRun();
    const rejectAgentRunMutation = useRejectAgentRun();
    const decideChatProposalMutation = useDecideChatProposal();
    const deleteChatSessionMutation = useDeleteChatSession();

    useGSAP(() => {
        gsap.from(container.current, { opacity: 0, y: 15, duration: 0.3, ease: 'power2.out' });
    }, { scope: container });

    // Ask Promptly owns general automation/form conversations. Workflow edits
    // are routed to the workflow-owned assistant by the workspace router.
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const prompt = params.get('prompt');
        if (prompt) setInput(prompt);
    }, []);

    useEffect(() => {
        if (!session || session.id !== sessionId) return;
        setMessages(session.messages?.length ? session.messages : [welcome]);
        setClarificationMode(getClarificationModePreference() || session.agentContext?.clarificationMode || DEFAULT_CLARIFICATION_MODE);
        setIsSidebarOpen(false);
    }, [session, sessionId]);

    // Local typing state belongs to the selected conversation. Reset it when
    // the route/session changes; the shared stream state continues tracking
    // any request that belongs to the conversation we left.
    useEffect(() => {
        setIsTyping(false);
        setStreamDetached(false);
        setRecoveryMode(false);
    }, [sessionId]);

    const durableProcessing = session?.agentState?.turn?.status === 'processing';
    useEffect(() => {
        if (durableProcessing && !isTyping && !sharedIsTyping && !streamDetached) setRecoveryMode(true);
        if (!durableProcessing && !streamDetached) setRecoveryMode(false);
    }, [durableProcessing, isTyping, sharedIsTyping, streamDetached]);

    const handleRecoverySnapshot = useCallback(snapshot => {
        const recoveredTurn = snapshot?.agentState?.turn;
        if (!streamDetached || !recoveredTurn || recoveredTurn.status === 'processing') return;
        setStreamDetached(false);
        setRecoveryMode(false);
        clearStreamState();
    }, [clearStreamState, streamDetached]);

    useDurableTurnMonitor({
        enabled: Boolean(sessionId && (streamDetached || (durableProcessing && recoveryMode))),
        refetch: refetchSession,
        onSnapshot: handleRecoverySnapshot
    });
    const filteredSessions = useMemo(() => {
        return sidebarSearch
            ? sessions.filter(s => s.title?.toLowerCase().includes(sidebarSearch.toLowerCase()))
            : sessions;
    }, [sessions, sidebarSearch]);

    const appendResponse = (response) => {
        if (response?.sessionId) {
            setSessionId(response.sessionId);
            // Replace url to have new session id without refreshing page
            const parsed = parsePath(window.location.href);
            if (!parsed.conversationId) {
                navigateTo({ page: 'assistant', conversationId: response.sessionId });
            }
        }
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
    };

    const handleClarificationModeChange = (mode) => {
        setClarificationMode(mode);
        setClarificationModePreference(mode);
    };

    const send = async (text, event = null) => {
        if (!text?.trim() && !event) return;
        if (isTyping || sharedIsTyping || durableProcessing) return;
        const requestId = globalThis.crypto?.randomUUID?.() || `chat_turn_${Date.now()}`;
        let detached = false;
        if (text?.trim()) setMessages(previous => [...previous, { id: `local_${requestId}`, sender: 'user', kind: 'text', text, isOptimistic: true }]);
        setInput('');
        if (text && /form/i.test(text)) setProgressLabel('Designing form');
        else setProgressLabel('Scanning available capabilities');
        setIsTyping(true);
        setStreamDetached(false);
        setRecoveryMode(false);
        setStreamState({
            isTyping: true,
            progressLabel: text && /form/i.test(text) ? 'Designing form' : 'Scanning available capabilities',
            surface: 'ask-promptly',
            sessionId
        });
        try {
            const response = await sendAssistantTurnMutation.mutateAsync({
                sessionId,
                message: text,
                context: {
                    surface: 'chat',
                    clarificationMode
                },
                event,
                requestId,
                onEvent: data => {
                    if (data.type === 'turn.started') {
                        if (data.sessionId && data.sessionId !== sessionId) setSessionId(data.sessionId);
                        void refetchSession();
                    }
                    if (data.type === 'run.progress' && data.work && data.messageId) {
                        setMessages(previous => {
                            const message = {
                                id: data.messageId,
                                sender: 'bot',
                                kind: 'assistant_work',
                                text: data.work.title || 'Preparing your request',
                                payload: { work: data.work }
                            };
                            return previous.some(item => item.id === data.messageId)
                                ? previous.map(item => item.id === data.messageId ? { ...item, ...message } : item)
                                : [...previous, message];
                        });
                    }
                    if (data.type === 'navigation.ready' && data.navigation) {
                        navigateTo(data.navigation);
                        return;
                    }
                    const label = getAgentProgressLabel(data);
                    if (label) {
                        setProgressLabel(label);
                        setStreamState({ isTyping: true, progressLabel: label, surface: 'ask-promptly', sessionId });
                    }
                }
            });
            appendResponse(response);
        } catch (error) {
            const errorCode = error?.code || error?.payload?.code;
            if (isDurableStreamDetachError(error) || ['ASSISTANT_TURN_IN_PROGRESS', 'ASSISTANT_TURN_ALREADY_RUNNING'].includes(errorCode)) {
                detached = true;
                setStreamDetached(true);
                setRecoveryMode(true);
                setStreamState({ isTyping: true, progressLabel: 'Still working in the background', surface: 'ask-promptly', sessionId });
                void refetchSession();
                toast.info(errorCode === 'ASSISTANT_TURN_IN_PROGRESS' || errorCode === 'ASSISTANT_TURN_ALREADY_RUNNING'
                    ? 'This conversation is already working in the background — reconnecting.'
                    : 'Still working in the background — reconnecting.');
                return;
            }
            setMessages(previous => [...previous, { id: `error_${Date.now()}`, sender: 'bot', kind: 'error', text: error.message || 'Sorry, I could not process that request.' }]);
        } finally {
            setIsTyping(false);
            if (!detached) clearStreamState();
        }
    };

    const handleApply = async (message, filteredSchema = null) => {
        setAcceptingProposalId(message.id);
        try {
            const payload = message.payload || {};
            if (payload.runId) {
                const result = await approveAgentRunMutation.mutateAsync({
                    runId: payload.runId,
                    idempotencyKey: `${payload.runId}:${message.id}`
                });
                setMessages(previous => [
                    ...previous.map(item => item.id === message.id ? { ...item, proposalStatus: 'applied' } : item),
                    ...(result.followUpReply ? [result.followUpReply] : [])
                ]);
                toast.success(result.followUpReply ? 'Form applied. Automation proposal is ready.' : 'Proposal applied.');
                return;
            }
            let result;
            if (['form_duplicate_proposal', 'form_delete_proposal', 'form_bulk_delete_proposal', 'form_response_clear_proposal'].includes(message.kind)) {
                result = await decideChatProposalMutation.mutateAsync({ sessionId, messageId: message.id, action: 'approve' });
                setMessages(previous => previous.map(item => item.id === message.id ? { ...item, proposalStatus: 'applied', payload: result?.message?.payload || item.payload } : item));
                toast.success(message.kind === 'form_bulk_delete_proposal' ? 'Forms deleted.' : message.kind === 'form_delete_proposal' ? 'Form deleted.' : message.kind === 'form_response_clear_proposal' ? 'Form responses cleared.' : 'Form duplicated.');
                return;
            } else if (['solution_proposal', 'form_proposal', 'workflow_diff', 'workflow_proposal'].includes(message.kind)) {
                const overrides = message.kind === 'form_proposal' && filteredSchema ? { schema: filteredSchema } : null;
                const decision = await decideChatProposalMutation.mutateAsync({ sessionId, messageId: message.id, action: 'approve', overrides });
                result = decision.resource;
                setMessages(previous => previous.map(item => item.id === message.id ? { ...item, proposalStatus: 'applied', payload: decision?.message?.payload || item.payload } : item));
            }
            setMessages(previous => previous.map(item => item.id === message.id ? { ...item, proposalStatus: 'applied' } : item));
            if (message.kind === 'form_proposal') await send(null, { type: 'form_saved', messageId: message.id, formId: result.formId });
            if (message.kind === 'workflow_proposal' && result.workflowId) {
                navigateTo({ page: 'automation-build', automationId: result.workflowId, editor: 'ai' });
            }
            toast.success('Proposal applied.');
        } catch (error) {
            if (error.payload?.code === 'FORM_PROPOSAL_STALE') {
                setMessages(previous => previous.map(item => item.id === message.id ? { ...item, proposalStatus: 'stale' } : item));
                try {
                    await send(null, { type: 'proposal_stale', messageId: message.id });
                } catch (persistError) {
                    console.error('Failed to persist stale chat proposal:', persistError);
                }
                toast.error('This suggestion is outdated. Generate a new one.');
            } else {
                toast.error(error.message || 'Failed to apply proposal.');
            }
        } finally {
            setAcceptingProposalId(null);
        }
    };

    const handleIgnore = async (message) => {
        setRejectingProposalId(message.id);
        try {
            if (message.payload?.runId) {
                await rejectAgentRunMutation.mutateAsync(message.payload.runId);
            } else if (['solution_proposal', 'form_proposal', 'workflow_diff', 'workflow_proposal', 'form_duplicate_proposal', 'form_delete_proposal', 'form_bulk_delete_proposal', 'form_response_clear_proposal'].includes(message.kind)) {
                await decideChatProposalMutation.mutateAsync({ sessionId, messageId: message.id, action: 'reject' });
            } else {
                await send(null, { type: 'proposal_ignored', messageId: message.id });
            }
            setMessages(previous => previous.map(item => item.id === message.id ? { ...item, proposalStatus: 'ignored' } : item));
        } catch (error) {
            toast.error(error.message || 'Failed to ignore proposal.');
        } finally {
            setRejectingProposalId(null);
        }
    };

    const handleRecoveryAction = (action, message, previousRequest = '') => {
        const recovery = message?.errorMetadata?.recovery || message?.payload?.recovery || {};
        if (action?.type === 'open_form' && action.formId) {
            navigateTo({ page: 'form-detail', formId: action.formId, section: action.section || 'build' });
            return;
        }
        if (action?.type === 'open_connections') {
            navigateTo({ page: 'settings', section: 'connections' });
            return;
        }
        if (action?.type === 'retry') {
            const retryText = recovery.retryText || previousRequest;
            if (retryText) void send(retryText);
            return;
        }
        setInput(recovery.suggestedPrompt || previousRequest || '');
    };

    const handleOption = (option) => {
        if (option?.type === 'agent_plan_approved' || option?.type === 'agent_plan_rejected') {
            return send(null, { type: option.type, runId: option.runId });
        }
        if (option?.id && option?.title) return send(null, { type: 'form_target_selected', formId: option.id });
        if (option?.type === 'preview_form') {
            setPreviewFormId(option.formId || null);
            setPreviewProposal(option.proposal);
            return;
        }
        if (option?.type === 'preview_update') {
            setPreviewProposal(prev => {
                if (prev && prev.formId === option.proposal.formId) {
                    return option.proposal;
                }
                return prev;
            });
            return;
        }
        if (option?.type === 'regenerate_proposal') {
            return send(option.text);
        }
        return send(typeof option === 'string' ? option : option?.label || option?.name || option?.title);
    };

    const newChat = () => { 
        setSessionId(null); 
        setIsTyping(false);
        setStreamDetached(false);
        setRecoveryMode(false);
        setMessages([welcome]); 
        setClarificationMode(getClarificationModePreference() || DEFAULT_CLARIFICATION_MODE);
        setPreviewFormId(null);
        setIsSidebarOpen(false); 
        navigateTo({ page: 'assistant' });
    };
    
    const loadChat = (id) => {
        setIsTyping(false);
        setStreamDetached(false);
        setRecoveryMode(false);
        setSessionId(id);
        setMessages([welcome]);
        setClarificationMode(getClarificationModePreference() || DEFAULT_CLARIFICATION_MODE);
        setIsSidebarOpen(false);
        navigateTo({ page: 'assistant', conversationId: id });
    };

    const confirmDelete = async () => {
        if (!chatToDelete) return;
        try {
            await deleteChatSessionMutation.mutateAsync(chatToDelete.id);
            toast.success('Conversation deleted');
            if (sessionId === chatToDelete.id) newChat();
        } catch (error) {
            toast.error('Failed to delete conversation: ' + error.message);
        } finally {
            setChatToDelete(null);
        }
    };

    const effectiveIsTyping = isTyping || sharedIsTyping || durableProcessing;
    const isCurrentConversationWorking = Boolean((sharedIsTyping && askActivity) || durableProcessing);
    const renderedMessages = messages;

    return (
        <div ref={container} className="surface-grid relative flex h-full min-h-0 w-full overflow-hidden font-sans">
            {isSidebarOpen && (
                <div 
                    className="md:hidden absolute inset-0 z-20 bg-slate-900/40 backdrop-blur-sm transition-opacity"
                    onClick={() => setIsSidebarOpen(false)}
                />
            )}
            <aside className={`z-30 flex h-full min-h-0 w-[280px] shrink-0 flex-col overflow-hidden border-r border-slate-200/80 bg-white/95 backdrop-blur-md transition-transform duration-300 md:relative ${isSidebarOpen ? 'absolute translate-x-0 shadow-2xl' : 'absolute -translate-x-full md:relative md:translate-x-0'}`}>
                {/* Sidebar Header */}
                <div className="p-4 flex items-center justify-between shrink-0">
                    <h3 className="pl-1 font-display text-[15px] font-bold tracking-tight text-[#171827]">Conversations</h3>
                    <div className="flex items-center gap-1">
                        <Button
                            variant="ghost"
                            size="icon-md"
                            onClick={newChat}
                            className="rounded-xl border border-transparent hover:border-gray-100"
                            title="New conversation"
                            iconLeft={
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                                </svg>
                            }
                        />
                        <Button
                            variant="ghost"
                            size="icon-md"
                            onClick={() => setIsSidebarOpen(false)}
                            className="md:hidden rounded-xl border border-transparent hover:border-gray-100 text-gray-500"
                            title="Close Sidebar"
                            iconLeft={
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                                </svg>
                            }
                        />
                    </div>
                </div>

                {/* Search */}
                <div className="px-4 pb-3">
                    <div className="relative group">
                        <input
                            type="text"
                            value={sidebarSearch}
                            onChange={e => setSidebarSearch(e.target.value)}
                            placeholder="Search chats..."
                            className="w-full bg-white/50 backdrop-blur-sm border border-gray-200/80 hover:border-gray-300 rounded-xl pl-9 pr-3 py-2 text-[13px] font-medium text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:bg-white transition-all shadow-inner"
                        />
                        <svg className="absolute left-3 top-2.5 text-gray-400 group-focus-within:text-indigo-500 transition-colors" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                        </svg>
                    </div>
                </div>

                {/* Chat List */}
                <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 pb-4 overscroll-contain">
                    {isSessionsPending ? (
                        <ChatSessionsSkeleton />
                    ) : filteredSessions.map(session => {
                        const isActive = session.id === sessionId;
                        const lastActive = formatCompactRelativeTime(session.updatedAt);
                        return (
                            <div
                                key={session.id}
                                onClick={() => loadChat(session.id)}
                                className={`flex items-start gap-3 px-3.5 py-3 rounded-xl cursor-pointer transition-all duration-300 group ${isActive
                                        ? 'bg-white shadow-md shadow-gray-200/40 border border-gray-100 scale-[1.02]'
                                        : 'text-gray-600 hover:bg-white/50 border border-transparent'
                                    }`}
                            >
                                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                                    <span className={`truncate text-[14px] ${isActive ? 'font-bold text-gray-900' : 'font-semibold text-gray-700'}`}>
                                        {session.title}
                                    </span>
                                    {lastActive && (
                                        <span className={`truncate text-[11px] font-medium ${isActive ? 'text-gray-500' : 'text-gray-400'}`}>
                                            Last active {lastActive}
                                        </span>
                                    )}
                                </div>
                                {activeStreams.some(stream => stream.id === `ask-promptly:${session.id}`) && (
                                    <LoaderCircle size={15} className="mt-0.5 shrink-0 animate-spin text-indigo-500" aria-label="AI is working" />
                                )}
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setChatToDelete(session);
                                    }}
                                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                                    title="Delete conversation"
                                >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                                </button>
                            </div>
                        );
                    })}
                    {filteredSessions.length === 0 && sidebarSearch && (
                        <div className="text-center py-10">
                            <p className="text-[13px] font-bold text-gray-400">No conversations match "{sidebarSearch}"</p>
                        </div>
                    )}
                </div>
            </aside>

            {/* Main Chat Area */}
            <div className="flex min-h-0 min-w-0 flex-1 flex-col h-full bg-transparent overflow-hidden">
                <div className="h-16 border-b border-gray-200/60 px-6 flex items-center bg-white/80 backdrop-blur-md z-10 shrink-0 shadow-sm">
                    <div className="flex items-center gap-3">
                        <button className="md:hidden p-2 -ml-2 text-slate-500 hover:bg-slate-100 rounded-lg transition-colors" onClick={() => setIsSidebarOpen(true)}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
                        </button>
                        <div>
                            <h2 className="text-[15px] font-extrabold text-gray-900 tracking-tight">AI Assistant</h2>
                            <p className="text-[11px] text-gray-500 font-medium">Describe and refine automations and forms</p>
                        </div>
                        {isCurrentConversationWorking && (
                            <LoaderCircle size={16} className="animate-spin text-indigo-500" aria-label="AI is working" />
                        )}
                    </div>
                </div>
                <GenericChatWidget 
                    messages={renderedMessages}
                    input={input}
                    setInput={setInput}
                    isTyping={effectiveIsTyping}
                    isLoadingHistory={Boolean(sessionId && isSessionPending)}
                    handleSend={send}
                    handleApply={(msg, filteredSchema) => {
                        handleApply(msg, filteredSchema);
                        setPreviewProposal(null);
                    }}
                    handleIgnore={(msg) => {
                        handleIgnore(msg);
                        setPreviewProposal(null);
                    }}
                    handleOption={handleOption}
                    onRecoveryAction={handleRecoveryAction}
                    acceptingProposalId={acceptingProposalId}
                    rejectingProposalId={rejectingProposalId}
                    progressLabel={sharedProgressLabel || progressLabel}
                    inputAccessory={<ClarificationModeSelect value={clarificationMode} onChange={handleClarificationModeChange} />}
                    placeholder="Describe what you want to build..."
                    suggestions={[
                        'Explain my current automations',
                        'Create an automation from a form submission',
                        'Help me fix my latest failed run',
                        'Improve the selected workflow'
                    ]}
                    bottomNotice="AI can make mistakes. Please verify."
                    innerClassName="max-w-4xl mx-auto w-full"
                    composerClassName="w-full max-w-none"
                />
            </div>
            
            <ConfirmModal
                isOpen={!!chatToDelete}
                onClose={() => setChatToDelete(null)}
                onConfirm={confirmDelete}
                title="Delete Chat"
                message={`Are you sure you want to delete the chat "${chatToDelete?.title}"? This action cannot be undone.`}
                confirmText="Delete"
                confirmVariant="dangerSolid"
                isLoading={deleteChatSessionMutation.isPending}
            />
            <FormDiffPreviewModal
                isOpen={!!previewProposal}
                onClose={() => setPreviewProposal(null)}
                currentForm={previewForm}
                proposal={previewProposal}
                onApply={() => {
                    const message = messages.find(item => item.id === previewProposal?.messageId);
                    if (message) handleApply(message, previewProposal?.schema);
                }}
                isApplying={acceptingProposalId === previewProposal?.messageId}
            />
        </div>
    );
}
