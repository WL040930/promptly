import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createForm, createWorkflow, getChatSession, getChatSessions, getWorkflow, getWorkflows, sendChatMessage, updateForm, updateWorkflow, deleteChatSession, getForm } from '../../api/backend.js';
import { useToast } from '../../context/ToastContext.jsx';
import Button from '../../components/ui/Button.jsx';
import AgentMessage from '../../components/chat/AgentMessage.jsx';
import ConfirmModal from '../../components/modals/ConfirmModal.jsx';
import FormDiffPreviewModal from '../../forms/FormDiffPreviewModal.jsx';
import { navigate, parsePath, buildPath } from '../../utils/router.js';

const welcome = { id: 'init', sender: 'bot', kind: 'text', text: 'Hi there! I can build workflows and forms from a description. What would you like to automate?' };

export default function ChatTab() {
    const toast = useToast();
    const queryClient = useQueryClient();

    const { data: sessions = [] } = useQuery({
        queryKey: ['chatSessions'],
        queryFn: getChatSessions
    });

    const { data: workflows = [] } = useQuery({
        queryKey: ['workflows'],
        queryFn: getWorkflows
    });

    const deleteChatSessionMutation = useMutation({
        mutationFn: deleteChatSession,
        onSuccess: () => {
            queryClient.invalidateQueries(['chatSessions']);
            toast.success('Chat deleted');
            if (sessionId === chatToDelete?.id) {
                newChat();
            }
            setChatToDelete(null);
        },
        onError: (error) => {
            toast.error('Failed to delete chat: ' + error.message);
            setChatToDelete(null);
        }
    });

    const createFormMutation = useMutation({ mutationFn: createForm });
    const updateFormMutation = useMutation({ mutationFn: ({id, data}) => updateForm(id, data) });
    const updateWorkflowMutation = useMutation({ mutationFn: ({id, data}) => updateWorkflow(id, data) });
    const createWorkflowMutation = useMutation({
        mutationFn: createWorkflow,
        onSuccess: () => queryClient.invalidateQueries(['workflows'])
    });

    const [messages, setMessages] = useState([welcome]);
    const [sessionId, setSessionId] = useState(null);
    const [targetWorkflow, setTargetWorkflow] = useState(null);
    const [input, setInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [progressLabel, setProgressLabel] = useState('Scanning node library');
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [sidebarSearch, setSidebarSearch] = useState('');
    const [chatToDelete, setChatToDelete] = useState(null);
    const [previewProposal, setPreviewProposal] = useState(null);
    const [previewForm, setPreviewForm] = useState(null);
    const endRef = useRef(null);

    useEffect(() => {
        const parsed = parsePath(window.location.pathname);
        if (parsed.mode === 'chat' && parsed.tab === 'chat' && parsed.sessionId) {
            loadChat(parsed.sessionId);
        }
    }, []);
    useEffect(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), [messages, isTyping]);

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
        if (response?.sessionId) queryClient.invalidateQueries(['chatSessions']);
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
            const response = await sendChatMessage(sessionId, text, { surface: 'chat', workflowId: targetWorkflow?.id || null, workflowSnapshot: targetSnapshot }, event);
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
            if (!targetWorkflow) throw new Error('Choose a workflow target before applying these changes.');
            if (payload.baseWorkflowUpdatedAt && targetWorkflow.updatedAt && payload.baseWorkflowUpdatedAt !== targetWorkflow.updatedAt) throw new Error('This workflow changed while the proposal was open. Generate the changes again.');
            await updateWorkflowMutation.mutateAsync({id: targetWorkflow.id, data: { nodes: payload.nodes, edges: payload.edges }});
            result = { workflowId: targetWorkflow.id };
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

    const handleOption = async (option) => {
        if (option?.id && option?.name) {
            const selected = await getWorkflow(option.id).catch(() => null);
            if (selected) setTargetWorkflow(selected);
            return send(null, { type: 'workflow_target_selected', workflowId: option.id });
        }
        if (option?.id && option?.title) return send(null, { type: 'form_target_selected', formId: option.id });
        if (option?.type === 'preview_form') {
            const current = option.formId ? await getForm(option.formId).catch(() => ({})) : {};
            setPreviewForm(current);
            setPreviewProposal(option.proposal);
            return;
        }
        return send(typeof option === 'string' ? option : option?.label || option?.name || option?.title);
    };

    const newChat = () => { 
        setSessionId(null); 
        setMessages([welcome]); 
        setTargetWorkflow(null); 
        setIsSidebarOpen(false); 
        navigate(buildPath({ mode: 'chat', tab: 'chat' }));
    };
    
    const loadChat = async (id) => {
        const session = await getChatSession(id).catch(() => null);
        if (!session) return;
        setSessionId(id);
        setMessages(session.messages?.length ? session.messages : [welcome]);
        if (session.agentContext?.workflowId) {
            const workflow = await getWorkflow(session.agentContext.workflowId).catch(() => null);
            setTargetWorkflow(workflow);
        }
        setIsSidebarOpen(false);
        navigate(buildPath({ mode: 'chat', tab: 'chat', sessionId: id }));
    };

    const confirmDelete = () => {
        if (!chatToDelete) return;
        deleteChatSessionMutation.mutate(chatToDelete.id);
    };

    return (
        <div className="flex w-full h-full bg-[#f4f7f9] relative overflow-hidden font-sans">
            {isSidebarOpen && (
                <div 
                    className="md:hidden absolute inset-0 z-20 bg-slate-900/40 backdrop-blur-sm transition-opacity"
                    onClick={() => setIsSidebarOpen(false)}
                />
            )}
            <aside className={`w-[280px] border-r border-gray-200/60 bg-white/95 backdrop-blur-md flex flex-col shrink-0 z-30 absolute md:relative h-full transition-transform duration-300 ${isSidebarOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full md:translate-x-0'}`}>
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
                <div className="flex-1 overflow-y-auto px-3 pb-4 flex flex-col gap-1">
                    {filteredSessions.map(session => {
                        const isActive = session.id === sessionId;
                        return (
                            <div
                                key={session.id}
                                onClick={() => loadChat(session.id)}
                                className={`flex items-center gap-3 px-3.5 py-3 rounded-xl cursor-pointer transition-all duration-300 group ${isActive
                                        ? 'bg-white shadow-md shadow-gray-200/40 border border-gray-100 scale-[1.02]'
                                        : 'text-gray-600 hover:bg-white/50 border border-transparent'
                                    }`}
                            >
                                <span className={`flex-1 truncate text-[14px] ${isActive ? 'font-bold text-gray-900' : 'font-medium'}`}>
                                    {session.title}
                                </span>
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
            <div className="flex-1 flex flex-col h-full bg-transparent">
                <div className="h-16 border-b border-gray-200/60 px-6 flex items-center justify-between bg-white/80 backdrop-blur-md sticky top-0 z-10 shrink-0 shadow-sm">
                    <div className="flex items-center gap-3">
                        <button className="md:hidden p-2 -ml-2 text-slate-500 hover:bg-slate-100 rounded-lg transition-colors" onClick={() => setIsSidebarOpen(true)}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
                        </button>
                        <div>
                            <h2 className="text-[15px] font-extrabold text-gray-900 tracking-tight">AI Assistant</h2>
                            <p className="text-[11px] text-gray-500 font-medium">Chat to build workflows and forms</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="hidden sm:inline text-xs font-semibold text-gray-400 uppercase tracking-wider">Target</span>
                        <select
                            value={targetWorkflow?.id || ''}
                            onChange={async event => { const id = event.target.value; setTargetWorkflow(id ? await getWorkflow(id) : null); }}
                            className="text-[13px] font-bold border border-gray-200 rounded-xl px-3 py-1.5 bg-white shadow-sm hover:border-gray-300 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all text-gray-700 max-w-[150px] sm:max-w-[200px]"
                        >
                            <option value="">Create new workflow</option>
                            {workflows.map(workflow => <option key={workflow.id} value={workflow.id}>{workflow.name}</option>)}
                        </select>
                    </div>
                </div>
                <div className="flex-1 p-6 overflow-y-auto flex flex-col gap-6 scroll-smooth">
                    <div className="max-w-4xl mx-auto w-full flex flex-col gap-6">
                        {messages.filter(msg => !['tool_call', 'tool_response'].includes(msg.kind)).map(message => (
                            <AgentMessage
                                key={message.id}
                                message={message}
                                onApply={handleApply}
                                onIgnore={handleIgnore}
                                onOption={handleOption}
                            />
                        ))}
                        {isTyping && (
                            <div className="flex w-full justify-start">
                                <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 shrink-0 mt-4 mr-2.5 shadow-sm border border-indigo-200/50">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="14" x="3" y="8" rx="2"/><path d="M12 5a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"/><path d="M12 5v3"/><path d="M8 14h.01"/><path d="M16 14h.01"/><path d="M9 19h6"/></svg>
                                </div>
                                <div className="flex flex-col gap-1 items-start max-w-[85%]">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-1">
                                        Promptly AI
                                    </span>
                                    <div className="bg-white border border-slate-200/60 rounded-2xl rounded-tl-none p-3.5 shadow-sm flex items-center gap-2 h-12">
                                        <span className="flex items-center gap-1">
                                            <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce"></span>
                                            <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></span>
                                            <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></span>
                                        </span>
                                        <span className="text-xs text-slate-500 font-medium ml-1">{progressLabel}…</span>
                                    </div>
                                </div>
                            </div>
                        )}
                        <div ref={endRef} />
                    </div>
                </div>
                <div className="p-4 bg-white/80 backdrop-blur-md border-t border-gray-200/60 shrink-0 shadow-[0_-4px_20px_-10px_rgba(0,0,0,0.05)] z-10 relative">
                    <div className="max-w-4xl mx-auto w-full">
                        <form onSubmit={event => { event.preventDefault(); send(input); }} className="relative flex items-center w-full">
                            <input
                                value={input}
                                onChange={event => setInput(event.target.value)}
                                placeholder="Describe what you want to build..."
                                disabled={isTyping}
                                className="w-full bg-white border border-slate-200 hover:border-slate-300 rounded-full pl-5 pr-14 py-3.5 text-[14px] text-slate-800 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-400 transition-all shadow-sm disabled:opacity-60 font-medium placeholder:text-gray-400"
                            />
                            <button
                                type="submit"
                                disabled={!input.trim() || isTyping}
                                className={`absolute right-1.5 w-10 h-10 p-0 rounded-full flex items-center justify-center transition-all ${input.trim() && !isTyping
                                        ? 'bg-indigo-600 text-white shadow-md hover:bg-indigo-700 hover:scale-105 active:scale-95'
                                        : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                    }`}
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                            </button>
                        </form>
                        <div className="text-center mt-2.5">
                            <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">AI can make mistakes. Please verify.</span>
                        </div>
                    </div>
                </div>
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
