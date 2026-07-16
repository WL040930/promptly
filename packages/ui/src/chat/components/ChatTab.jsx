import React, { useEffect, useMemo, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { useToast } from '../../context/ToastContext.jsx';
import { useChatSession, useChatSessions, useDeleteChatSession, useSendChatMessage } from '../../api/hooks/useChat.js';
import { useCreateForm, useForm, useUpdateForm } from '../../api/hooks/useForms.js';
import { useCreateWorkflow, useUpdateWorkflow, useWorkflow } from '../../api/hooks/useWorkflows.js';
import Button from '../../components/ui/Button.jsx';
import GenericChatWidget from '../../components/chat/GenericChatWidget.jsx';
import ConfirmModal from '../../components/modals/ConfirmModal.jsx';
import FormDiffPreviewModal from '../../forms/FormDiffPreviewModal.jsx';
import { navigate, parsePath, buildPath } from '../../utils/router.js';
import { formatCompactRelativeTime } from '../../utils/time.js';
import ChatSessionsSkeleton from '../../components/chat/ChatSessionsSkeleton.jsx';

const welcome = { id: 'init', sender: 'bot', kind: 'text', text: 'Hi there! I can build workflows and forms from a description. What would you like to automate?' };

export default function ChatTab() {
    const toast = useToast();
    const container = useRef(null);
    const [messages, setMessages] = useState([welcome]);
    const [sessionId, setSessionId] = useState(() => parsePath(window.location.pathname).sessionId || null);
    const [targetWorkflowId, setTargetWorkflowId] = useState(null);
    const [input, setInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [progressLabel, setProgressLabel] = useState('Scanning node library');
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [sidebarSearch, setSidebarSearch] = useState('');
    const [chatToDelete, setChatToDelete] = useState(null);
    const [previewProposal, setPreviewProposal] = useState(null);
    const [previewFormId, setPreviewFormId] = useState(null);
    const loadedSessionIdRef = useRef(null);

    const { data: sessions = [], isPending: isSessionsPending } = useChatSessions();
    const { data: session, isPending: isSessionPending } = useChatSession(sessionId);
    const { data: targetWorkflow } = useWorkflow(targetWorkflowId);
    const { data: previewForm } = useForm(previewFormId);
    const sendChatMessageMutation = useSendChatMessage();
    const deleteChatSessionMutation = useDeleteChatSession();
    const createFormMutation = useCreateForm();
    const updateFormMutation = useUpdateForm();
    const updateWorkflowMutation = useUpdateWorkflow();
    const createWorkflowMutation = useCreateWorkflow();

    useGSAP(() => {
        gsap.from(container.current, { opacity: 0, y: 15, duration: 0.3, ease: 'power2.out' });
    }, { scope: container });

    useEffect(() => {
        if (!session || loadedSessionIdRef.current === sessionId) return;
        loadedSessionIdRef.current = sessionId;
        setMessages(session.messages?.length ? session.messages : [welcome]);
        setTargetWorkflowId(session.agentContext?.workflowId || null);
        setIsSidebarOpen(false);
    }, [session, sessionId]);
    const filteredSessions = useMemo(() => {
        return sidebarSearch
            ? sessions.filter(s => s.title?.toLowerCase().includes(sidebarSearch.toLowerCase()))
            : sessions;
    }, [sessions, sidebarSearch]);

    const targetSnapshot = useMemo(() => targetWorkflow ? {
        nodes: (targetWorkflow.nodes || []).map(node => ({ id: node.id, title: node.title, type: node.type, subType: node.subType })),
        edges: (targetWorkflow.edges || []).map(edge => ({ id: edge.id, source: edge.source, target: edge.target, sourceHandle: edge.sourceHandle || null, targetHandle: edge.targetHandle || null }))
    } : null, [targetWorkflow]);

    const appendResponse = (response) => {
        if (response?.sessionId) {
            setSessionId(response.sessionId);
            // Replace url to have new session id without refreshing page
            const parsed = parsePath(window.location.pathname);
            if (!parsed.sessionId) {
                 navigate(buildPath({ mode: 'chat', tab: 'chat', sessionId: response.sessionId }));
            }
        }
        if (response?.reply) setMessages(previous => [...previous, response.reply]);
    };

    const send = async (text, event = null) => {
        if (!text?.trim() && !event) return;
        if (text?.trim()) setMessages(previous => [...previous, { id: `local_${Date.now()}`, sender: 'user', kind: 'text', text }]);
        setInput('');
        if (text && /form/i.test(text)) setProgressLabel('Designing form');
        else if (text && targetWorkflow && /\b(add|remove|change|modify|update|insert|delete|edit)\b/i.test(text)) setProgressLabel('Analysing current workflow');
        else setProgressLabel(targetWorkflow ? 'Analysing current workflow' : 'Scanning node library');
        setIsTyping(true);
        try {
            const response = await sendChatMessageMutation.mutateAsync({
                sessionId,
                message: text,
                context: { surface: 'chat', workflowId: targetWorkflow?.id || null, workflowSnapshot: targetSnapshot },
                event
            });
            appendResponse(response);
        } catch (error) {
            setMessages(previous => [...previous, { id: `error_${Date.now()}`, sender: 'bot', kind: 'error', text: error.message || 'Sorry, I could not process that request.' }]);
        } finally {
            setIsTyping(false);
        }
    };

    const handleApply = async (message) => {
        const payload = message.payload || {};
        let result;
        if (message.kind === 'form_proposal') {
            const schema = payload.schema || {};
            const data = { title: schema.title || 'New Promptly Form', description: schema.description || '', settings: schema.settings || {}, fields: schema.fields || [] };
            const saved = payload.formId ? await updateFormMutation.mutateAsync({id: payload.formId, data}) : await createFormMutation.mutateAsync(data);
            result = { formId: saved.id };
        } else if (message.kind === 'workflow_diff') {
            const workflowId = payload.workflowId || targetWorkflow?.id || targetWorkflowId;
            if (!workflowId) throw new Error('Choose a workflow target before applying these changes.');
            if (payload.baseWorkflowUpdatedAt && targetWorkflow?.updatedAt && payload.baseWorkflowUpdatedAt !== targetWorkflow.updatedAt) throw new Error('This workflow changed while the proposal was open. Generate the changes again.');
            await updateWorkflowMutation.mutateAsync({id: workflowId, data: { nodes: payload.nodes, edges: payload.edges }});
            result = { workflowId };
        } else if (message.kind === 'workflow_proposal') {
            const saved = await createWorkflowMutation.mutateAsync({ name: payload.name || 'New Workflow', status: 'Draft', iconColor: 'text-indigo-600', iconBg: 'bg-indigo-100', nodes: payload.nodes || [], edges: payload.edges || [] });
            result = { workflowId: saved.id };
        }
        setMessages(previous => previous.map(item => item.id === message.id ? { ...item, proposalStatus: 'applied' } : item));
        if (message.kind === 'form_proposal') await send(null, { type: 'form_saved', messageId: message.id, formId: result.formId });
        else await send(null, { type: 'proposal_applied', messageId: message.id });
        toast.success('Proposal applied.');
    };

    const handleIgnore = (message) => {
        setMessages(previous => previous.map(item => item.id === message.id ? { ...item, proposalStatus: 'ignored' } : item));
        send(null, { type: 'proposal_ignored', messageId: message.id });
    };

    const handleOption = (option) => {
        if (option?.id && option?.name) {
            setTargetWorkflowId(option.id);
            return send(null, { type: 'workflow_target_selected', workflowId: option.id });
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
        return send(typeof option === 'string' ? option : option?.label || option?.name || option?.title);
    };

    const newChat = () => { 
        setSessionId(null); 
        setMessages([welcome]); 
        setTargetWorkflowId(null);
        setPreviewFormId(null);
        loadedSessionIdRef.current = null;
        setIsSidebarOpen(false); 
        navigate(buildPath({ mode: 'chat', tab: 'chat' }));
    };
    
    const loadChat = (id) => {
        loadedSessionIdRef.current = null;
        setSessionId(id);
        setMessages([welcome]);
        setIsSidebarOpen(false);
        navigate(buildPath({ mode: 'chat', tab: 'chat', sessionId: id }));
    };

    const confirmDelete = async () => {
        if (!chatToDelete) return;
        try {
            await deleteChatSessionMutation.mutateAsync(chatToDelete.id);
            toast.success('Chat deleted');
            if (sessionId === chatToDelete.id) newChat();
        } catch (error) {
            toast.error('Failed to delete chat: ' + error.message);
        } finally {
            setChatToDelete(null);
        }
    };

    return (
        <div ref={container} className="flex min-h-0 w-full h-full bg-[#f4f7f9] relative overflow-hidden font-sans">
            {isSidebarOpen && (
                <div 
                    className="md:hidden absolute inset-0 z-20 bg-slate-900/40 backdrop-blur-sm transition-opacity"
                    onClick={() => setIsSidebarOpen(false)}
                />
            )}
            <aside className={`w-[280px] min-h-0 border-r border-gray-200/60 bg-white/95 backdrop-blur-md flex flex-col shrink-0 z-30 absolute md:relative h-full overflow-hidden transition-transform duration-300 ${isSidebarOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full md:translate-x-0'}`}>
                {/* Sidebar Header */}
                <div className="p-4 flex items-center justify-between shrink-0">
                    <h3 className="font-extrabold text-gray-900 text-[15px] tracking-tight pl-1">Chats</h3>
                    <div className="flex items-center gap-1">
                        <Button
                            variant="ghost"
                            size="icon-md"
                            onClick={newChat}
                            className="rounded-xl border border-transparent hover:border-gray-100"
                            title="New Chat"
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
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setChatToDelete(session);
                                    }}
                                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                                    title="Delete Chat"
                                >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                                </button>
                            </div>
                        );
                    })}
                    {filteredSessions.length === 0 && sidebarSearch && (
                        <div className="text-center py-10">
                            <p className="text-[13px] font-bold text-gray-400">No chats match "{sidebarSearch}"</p>
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
                            <p className="text-[11px] text-gray-500 font-medium">Chat to build workflows and forms</p>
                        </div>
                    </div>
                </div>
                <GenericChatWidget 
                    messages={messages}
                    input={input}
                    setInput={setInput}
                    isTyping={isTyping}
                    isLoadingHistory={Boolean(sessionId && isSessionPending)}
                    handleSend={send}
                    handleApply={(msg, filteredSchema, unselectedIndices) => {
                        const updatedMessage = {
                            ...msg,
                            payload: {
                                ...msg.payload,
                                schema: filteredSchema || msg.payload?.schema,
                                unselectedPatchIndices: unselectedIndices
                            }
                        };
                        handleApply(updatedMessage);
                        setPreviewProposal(null);
                    }}
                    handleIgnore={(msg) => {
                        handleIgnore(msg);
                        setPreviewProposal(null);
                    }}
                    handleOption={handleOption}
                    progressLabel={progressLabel}
                    placeholder="Describe what you want to build..."
                    suggestions={[]}
                    bottomNotice="AI can make mistakes. Please verify."
                    innerClassName="max-w-4xl mx-auto w-full"
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
            />
        </div>
    );
}
