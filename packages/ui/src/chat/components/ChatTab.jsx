import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createForm, createWorkflow, getChatSession, getChatSessions, getWorkflow, getWorkflows, sendChatMessage, updateForm, updateWorkflow } from '../../api/backend.js';
import { useToast } from '../../components/ToastContext.jsx';
import Button from '../../components/Button.jsx';
import AgentMessage from '../../components/AgentMessage.jsx';

const welcome = { id: 'init', sender: 'bot', kind: 'text', text: 'Hi there! I can build workflows and forms from a description. What would you like to automate?' };

export default function ChatTab() {
    const toast = useToast();
    const [messages, setMessages] = useState([welcome]);
    const [sessions, setSessions] = useState([]);
    const [sessionId, setSessionId] = useState(null);
    const [workflows, setWorkflows] = useState([]);
    const [targetWorkflow, setTargetWorkflow] = useState(null);
    const [input, setInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [progressLabel, setProgressLabel] = useState('Scanning node library');
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const endRef = useRef(null);

    const loadSessions = async () => setSessions(await getChatSessions());
    useEffect(() => {
        loadSessions();
        getWorkflows().then(setWorkflows).catch(() => {});
    }, []);
    useEffect(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), [messages, isTyping]);

    const targetSnapshot = useMemo(() => targetWorkflow ? {
        nodes: (targetWorkflow.nodes || []).map(node => ({ id: node.id, title: node.title, type: node.type, subType: node.subType })),
        edges: (targetWorkflow.edges || []).map(edge => ({ id: edge.id, source: edge.source, target: edge.target, sourceHandle: edge.sourceHandle || null, targetHandle: edge.targetHandle || null }))
    } : null, [targetWorkflow]);

    const appendResponse = (response) => {
        if (response?.sessionId) setSessionId(response.sessionId);
        if (response?.reply) setMessages(previous => [...previous, response.reply]);
        if (response?.sessionId) loadSessions();
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
            const saved = payload.formId ? await updateForm(payload.formId, data) : await createForm(data);
            result = { formId: saved.id };
        } else if (message.kind === 'workflow_diff') {
            if (!targetWorkflow) throw new Error('Choose a workflow target before applying these changes.');
            if (payload.baseWorkflowUpdatedAt && targetWorkflow.updatedAt && payload.baseWorkflowUpdatedAt !== targetWorkflow.updatedAt) throw new Error('This workflow changed while the proposal was open. Generate the changes again.');
            await updateWorkflow(targetWorkflow.id, { nodes: payload.nodes, edges: payload.edges });
            result = { workflowId: targetWorkflow.id };
        } else if (message.kind === 'workflow_proposal') {
            const saved = await createWorkflow({ name: payload.name || 'New Workflow', status: 'Draft', iconColor: 'text-indigo-600', iconBg: 'bg-indigo-100', nodes: payload.nodes || [], edges: payload.edges || [] });
            setWorkflows(previous => [...previous, saved]);
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
        return send(typeof option === 'string' ? option : option?.label || option?.name || option?.title);
    };

    const newChat = () => { setSessionId(null); setMessages([welcome]); setTargetWorkflow(null); setIsSidebarOpen(false); };
    const loadChat = async (id) => {
        const session = await getChatSession(id);
        setSessionId(id);
        setMessages(session.messages?.length ? session.messages : [welcome]);
        if (session.agentContext?.workflowId) {
            const workflow = await getWorkflow(session.agentContext.workflowId).catch(() => null);
            setTargetWorkflow(workflow);
        }
        setIsSidebarOpen(false);
    };

    return (
        <div className="flex w-full h-full bg-white relative overflow-hidden">
            <aside className={`w-[260px] border-r border-gray-200 bg-white flex flex-col shrink-0 absolute md:relative h-full z-20 transition-transform ${isSidebarOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full md:translate-x-0'}`}>
                <div className="p-4 flex items-center justify-between"><h3 className="font-extrabold text-gray-900">Chats</h3><Button variant="ghost" size="icon-md" onClick={newChat}>+</Button></div>
                <div className="flex-1 overflow-y-auto px-3 pb-4 flex flex-col gap-1">{sessions.map(session => <button key={session.id} onClick={() => loadChat(session.id)} className={`text-left px-3 py-3 rounded-xl hover:bg-slate-50 ${session.id === sessionId ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700'}`}>{session.title}</button>)}</div>
            </aside>
            <div className="flex-1 flex flex-col h-full">
                <div className="border-b border-slate-100 px-4 py-3 flex items-center gap-3">
                    <button className="md:hidden" onClick={() => setIsSidebarOpen(true)}>☰</button>
                    <span className="text-sm font-bold text-slate-700">Workflow target</span>
                    <select value={targetWorkflow?.id || ''} onChange={async event => { const id = event.target.value; setTargetWorkflow(id ? await getWorkflow(id) : null); }} className="text-sm border border-slate-200 rounded-lg px-2 py-1 bg-white">
                        <option value="">Create new workflow</option>
                        {workflows.map(workflow => <option key={workflow.id} value={workflow.id}>{workflow.name}</option>)}
                    </select>
                </div>
                <div className="flex-1 p-6 overflow-y-auto flex flex-col gap-6">{messages.map(message => <AgentMessage key={message.id} message={message} onApply={handleApply} onIgnore={handleIgnore} onOption={handleOption} />)}{isTyping && <div className="text-xs font-semibold text-slate-400 px-10">{progressLabel}…</div>}<div ref={endRef} /></div>
                <div className="p-4 bg-white border-t border-slate-100"><form onSubmit={event => { event.preventDefault(); send(input); }} className="relative max-w-4xl mx-auto"><input value={input} onChange={event => setInput(event.target.value)} placeholder="Describe a workflow or form…" disabled={isTyping} className="w-full bg-slate-50 border border-slate-200 rounded-full pl-5 pr-14 py-3.5 text-sm focus:outline-none focus:ring-4 focus:ring-indigo-500/10" /><button type="submit" disabled={!input.trim() || isTyping} className="absolute right-1.5 top-1.5 w-10 h-10 rounded-full bg-indigo-600 text-white disabled:bg-slate-100 disabled:text-slate-400">➤</button></form></div>
            </div>
        </div>
    );
}
