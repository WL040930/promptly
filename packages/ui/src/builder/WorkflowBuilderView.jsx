import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import WorkflowCanvas from './components/WorkflowCanvas';
import PropertyInspector from './components/PropertyInspector';
import AIAgentChat from './components/AIAgentChat';
import NodeLibrarySidebar from './components/NodeLibrarySidebar';
import BuilderToolbar from './components/BuilderToolbar';
import WorkflowOverview from './overview/WorkflowOverview';
import OverviewModal from './overview/OverviewModal';
import { MODAL_TYPES, MODAL_CONFIG } from './overview/constants.js';
import DashboardTab from './components/DashboardTab';
import FormsTab from './components/FormsTab';
import LogsTab from '../chat/components/LogsTab';
import { navigate, parsePath } from '../utils/router.js';
import { useWorkflows, useCreateWorkflow, useUpdateWorkflow } from '../api/hooks/useWorkflows.js';
import { useFolders } from '../api/hooks/useFolders.js';
import { useRunWorkflow } from '../api/hooks/useRunWorkflow.js';
import ExecutionPanel from './components/ExecutionPanel';

const WorkflowBuilderView = ({ activeTab, setActiveTab, setSidebarCollapsed }) => {
    // ── Server data ──────────────────────────────────────────────────────────
    const { data: folders = [], isLoading: isFoldersLoading } = useFolders();
    const { data: workflowsData = [], isLoading: isWorkflowsLoading } = useWorkflows();
    const createWorkflowMutation = useCreateWorkflow();
    const updateWorkflowMutation = useUpdateWorkflow();
    const queryClient = useQueryClient();

    // ── Optimistic cache updaters ────────────────────────────────────────────
    const setFolders = (updater) => {
        queryClient.setQueryData(['folders'], old => {
            const current = old || [];
            return typeof updater === 'function' ? updater(current) : updater;
        });
    };

    const setWorkflows = (updater) => {
        queryClient.setQueryData(['workflows'], old => {
            const current = old || [];
            const prevMap = {};
            current.forEach(w => { prevMap[w.id] = w; });
            const nextMap = typeof updater === 'function' ? updater(prevMap) : updater;
            return Object.values(nextMap);
        });
    };

    // Only show skeleton on initial load (no data yet), not on background refetches
    const loading = (isFoldersLoading && folders.length === 0) || (isWorkflowsLoading && workflowsData.length === 0);

    // Normalise workflows array → id-keyed map for fast lookup
    const workflows = useMemo(() => {
        const map = {};
        workflowsData.forEach(w => { map[w.id] = w; });
        return map;
    }, [workflowsData]);

    // ── UI state ─────────────────────────────────────────────────────────────
    const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(true);
    const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(true);
    const [rightTab, setRightTab] = useState('chat');
    const [draggedNode, setDraggedNode] = useState(null);
    const [modal, setModal] = useState({ isOpen: false, type: null, data: null, inputValue: '', formData: {} });
    const [isSubmitting, setIsSubmitting] = useState(false);

    // ── Execution panel state ─────────────────────────────────────────────
    const [isExecutionPanelOpen, setIsExecutionPanelOpen] = useState(false);
    const [lastExecutionLog, setLastExecutionLog]         = useState(null);
    const runWorkflowMutation = useRunWorkflow();

    const handleTestRun = async () => {
        if (!activeWorkflowId) return;
        setIsExecutionPanelOpen(true);
        setLastExecutionLog(null);
        try {
            const log = await runWorkflowMutation.mutateAsync({ workflowId: activeWorkflowId, payload: {} });
            setLastExecutionLog(log);
        } catch (err) {
            setLastExecutionLog({ status: 'Failed', durationMs: 0, steps: [], error: err.message });
        }
    };

    // Real-time relative timestamp ticker
    const [currentTime, setCurrentTime] = useState(() => Date.now());
    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(Date.now()), 60000);
        return () => clearInterval(timer);
    }, []);

    // ── URL-driven view/workflow routing ─────────────────────────────────────
    const getViewStateFromUrl = () => {
        const parsed = parsePath(window.location.pathname);
        return {
            viewMode: parsed.viewMode || 'overview',
            workflowId: parsed.workflowId || 'w2'
        };
    };

    const [activeWorkflowId, setActiveWorkflowId] = useState(() => getViewStateFromUrl().workflowId);
    const [activeNodeId, setActiveNodeId] = useState('w2-2');
    const [viewMode, setViewModeState] = useState(() => getViewStateFromUrl().viewMode);

    // Sync view state when user hits back/forward
    useEffect(() => {
        const handler = () => {
            const { viewMode: vm, workflowId: wid } = getViewStateFromUrl();
            setViewModeState(vm);
            setActiveWorkflowId(wid);
        };
        window.addEventListener('popstate', handler);
        return () => window.removeEventListener('popstate', handler);
    }, []);

    // ── Navigation helpers ───────────────────────────────────────────────────
    const navigateToBuilder = (wfId) => {
        navigate(`/workflow/builder/${wfId}`);
        setViewModeState('builder');
        setActiveWorkflowId(wfId);
        if (setSidebarCollapsed) setSidebarCollapsed(true);
    };

    const navigateToOverview = () => {
        navigate('/workflow/workflows');
        setViewModeState('overview');
    };

    const setViewMode = (mode) => {
        if (mode === 'overview') navigateToOverview();
    };

    const handleSelectWorkflow = (wfId) => navigateToBuilder(wfId);

    const handleCreateWorkflow = (e) => {
        const wfData = {
            name: 'New Sequence Automation',
            folderId: folders.length > 0 ? folders[0].id : null,
            status: 'Draft',
            iconColor: 'text-indigo-600',
            iconBg: 'bg-indigo-100',
            nodes: []
        };
        createWorkflowMutation.mutate(wfData, {
            onSuccess: (newWorkflow) => navigateToBuilder(newWorkflow.id),
            onSettled: () => { if (e?.detail?.onComplete) e.detail.onComplete(); }
        });
    };

    // Listen for the custom create-workflow event (from other parts of the UI)
    useEffect(() => {
        window.addEventListener('create-workflow', handleCreateWorkflow);
        return () => window.removeEventListener('create-workflow', handleCreateWorkflow);
    }, [folders]);

    // ── Derived data ─────────────────────────────────────────────────────────
    const activeWorkflow = useMemo(
        () => workflows[activeWorkflowId] || Object.values(workflows)[0] || null,
        [workflows, activeWorkflowId]
    );
    const nodes = activeWorkflow?.nodes || [];
    const edges = activeWorkflow?.edges || [];
    const activeNode = useMemo(() => nodes.find(n => n.id === activeNodeId) || null, [nodes, activeNodeId]);

    const activeFolder = useMemo(() => {
        if (!activeWorkflow?.folderId) return null;
        return folders.find(f => f.id === activeWorkflow.folderId);
    }, [folders, activeWorkflow]);
    const activeFolderName = activeFolder ? activeFolder.name : 'Root';

    const activeWorkflowCount = useMemo(
        () => Object.values(workflows).filter(w => w.status === 'Active').length,
        [workflows]
    );

    // ── Workflow mutation helpers ─────────────────────────────────────────────
    const handleWorkflowUpdate = (updatedFields) => {
        if (!activeWorkflowId) return;
        updateWorkflowMutation.mutate({ id: activeWorkflowId, data: updatedFields });
    };

    // ── Modal & Title editing ────────────────────────────────────────────────
    const openModal = useCallback((type, data = null) => {
        setModal({ 
            isOpen: true, 
            type, 
            data, 
            inputValue: data?.currentName || '',
            formData: {
                name: data?.currentName || '',
                icon: data?.icon || 'default',
                iconColor: data?.iconColor || 'text-indigo-600',
                iconBg: data?.iconBg || 'bg-indigo-100'
            }
        });
    }, []);

    const closeModal = useCallback(() => {
        setModal({ isOpen: false, type: null, data: null, inputValue: '', formData: {} });
    }, []);

    const handleModalSubmit = useCallback(async () => {
        setIsSubmitting(true);
        try {
            if (modal.type === MODAL_TYPES.EDIT_WORKFLOW_PROPERTIES && activeWorkflowId) {
                const nameValue = modal.formData.name?.trim() || 'Untitled Workflow';
                const payload = {
                    name: nameValue,
                    icon: modal.formData.icon,
                    iconBg: modal.formData.iconBg,
                    iconColor: modal.formData.iconColor,
                };
                await updateWorkflowMutation.mutateAsync({ id: activeWorkflowId, data: payload });
            }
        } catch (error) {
            console.error('Action failed:', error);
        } finally {
            setIsSubmitting(false);
            closeModal();
        }
    }, [modal, activeWorkflowId, updateWorkflowMutation, closeModal]);

    const handleTitleEditStart = () => {
        const activeWorkflow = workflows[activeWorkflowId];
        openModal(MODAL_TYPES.EDIT_WORKFLOW_PROPERTIES, {
            currentName: activeWorkflow?.name,
            icon: activeWorkflow?.icon,
            iconBg: activeWorkflow?.iconBg,
            iconColor: activeWorkflow?.iconColor,
        });
    };

    // ── Node operations ──────────────────────────────────────────────────────
    const handleNodeClick = (nodeId) => {
        setActiveNodeId(nodeId);
        setRightTab('properties');
        setIsRightSidebarOpen(true);
    };

    const handleApplyAction = (proposal) => {
        const newNodeId = `${activeWorkflowId}-${Date.now()}`;
        const updatedNodes = [...nodes, {
            id: newNodeId,
            type: proposal.type,
            subType: proposal.subType,
            title: proposal.title,
            description: proposal.description
        }];
        handleWorkflowUpdate({ nodes: updatedNodes });
        setActiveNodeId(newNodeId);
    };

    const handleAddNode = (nodeData, position) => {
        const newNodeId = `${activeWorkflowId}-${Date.now()}`;
        const updatedNodes = [...nodes, {
            id: newNodeId,
            type: nodeData.type,
            subType: nodeData.subType,
            title: nodeData.title,
            description: nodeData.description,
            schema: nodeData.schema,
            icon: nodeData.icon,
            bgColor: nodeData.bgColor,
            color: nodeData.color,
            position
        }];
        handleWorkflowUpdate({ nodes: updatedNodes });
        setActiveNodeId(newNodeId);
    };

    const handleNodesChange = (changes) => {
        const positionChanges = changes.filter(c => c.type === 'position' && c.position && !c.dragging);
        const removeChanges = changes.filter(c => c.type === 'remove');
        if (positionChanges.length === 0 && removeChanges.length === 0) return;

        let updatedNodes = [...nodes];

        if (positionChanges.length > 0) {
            updatedNodes = updatedNodes.map(node => {
                const change = positionChanges.find(c => c.id === node.id);
                return change ? { ...node, position: change.position } : node;
            });
        }

        if (removeChanges.length > 0) {
            const removeIds = removeChanges.map(c => c.id);
            updatedNodes = updatedNodes.filter(node => !removeIds.includes(node.id));
            if (removeIds.includes(activeNodeId)) {
                setActiveNodeId(null);
                setIsRightSidebarOpen(false);
            }
        }

        handleWorkflowUpdate({ nodes: updatedNodes });
    };

    const handleEdgesChange = (updatedEdges) => {
        handleWorkflowUpdate({ edges: updatedEdges });
    };

    const handleUpdateNode = (nodeId, updatedFields) => {
        const updatedNodes = nodes.map(node => {
            if (node.id !== nodeId) return node;
            const nextNode = { ...node, ...updatedFields };
            if (updatedFields.config && node.config) {
                nextNode.config = { ...node.config, ...updatedFields.config };
            }
            return nextNode;
        });
        handleWorkflowUpdate({ nodes: updatedNodes });
    };

    // ── GSAP entrance animation ───────────────────────────────────────────────
    const builderContainer = useRef(null);
    useGSAP(() => {
        if (viewMode === 'builder') {
            gsap.from(builderContainer.current, { opacity: 0, duration: 0.3, ease: 'power2.out' });
        }
    }, { scope: builderContainer, dependencies: [viewMode] });

    // ── Early returns ────────────────────────────────────────────────────────
    if (loading) {
        return (
            <div className="flex-1 flex w-full h-full bg-slate-50 overflow-hidden font-sans">
                <aside className="w-72 bg-slate-50/90 border-r border-slate-200/60 flex flex-col h-full z-20 shrink-0">
                    <div className="p-4 border-b border-slate-200 shrink-0">
                        <div className="h-4 w-24 bg-slate-200 animate-pulse rounded mb-4"></div>
                        <div className="h-10 w-full bg-slate-200 animate-pulse rounded-lg"></div>
                    </div>
                    <div className="flex-1 p-3 flex flex-col gap-4">
                        {[1, 2, 3].map(i => (
                            <div key={i}>
                                <div className="h-4 w-20 bg-slate-200 animate-pulse rounded mb-2"></div>
                                <div className="h-20 w-full bg-slate-200 animate-pulse rounded-r-xl"></div>
                            </div>
                        ))}
                    </div>
                </aside>
                <main className="flex-1 flex flex-col h-full bg-slate-50/50 relative overflow-hidden">
                    <div className="w-full h-14 bg-white/80 border-b border-slate-200/60 flex items-center px-4 z-10 shrink-0 gap-4">
                        <div className="h-8 w-8 bg-slate-200 animate-pulse rounded-lg"></div>
                        <div className="h-8 w-32 bg-slate-200 animate-pulse rounded-lg"></div>
                        <div className="ml-auto flex gap-2">
                            <div className="h-8 w-24 bg-slate-200 animate-pulse rounded-lg"></div>
                            <div className="h-8 w-24 bg-slate-200 animate-pulse rounded-lg"></div>
                        </div>
                    </div>
                    <div className="flex-1 relative">
                        <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(#94a3b8 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>
                        <div className="absolute top-32 left-1/4 w-64 h-32 bg-white border border-slate-200 rounded-xl shadow-sm animate-pulse"></div>
                        <div className="absolute top-64 left-1/2 w-64 h-32 bg-white border border-slate-200 rounded-xl shadow-sm animate-pulse"></div>
                    </div>
                </main>
            </div>
        );
    }

    if (activeTab === 'dashboard') return <DashboardTab activeWorkflowCount={activeWorkflowCount} onNavigateTab={setActiveTab} />;
    if (activeTab === 'forms') return <FormsTab />;
    if (activeTab === 'logs') return <LogsTab />;

    if (viewMode === 'overview') {
        return (
            <WorkflowOverview
                folders={folders}
                setFolders={setFolders}
                workflows={workflows}
                setWorkflows={setWorkflows}
                onCreateWorkflow={handleCreateWorkflow}
                onSelectWorkflow={handleSelectWorkflow}
            />
        );
    }

    // ── Builder view ─────────────────────────────────────────────────────────
    return (
        <div ref={builderContainer} className="flex-1 flex w-full h-full bg-slate-50 overflow-hidden font-sans">

            {/* 1. LEFT SIDEBAR: Node Library */}
            <NodeLibrarySidebar
                isOpen={isLeftSidebarOpen}
                onDragStart={(node) => setDraggedNode(node)}
                onDragEnd={() => setDraggedNode(null)}
            />

            {/* 2. CENTER: Canvas + Toolbar */}
            <main className="flex-1 flex flex-col h-full bg-slate-50/50 relative overflow-hidden">
                {modal.isOpen && (
                    <OverviewModal
                        config={MODAL_CONFIG[modal.type]}
                        inputValue={modal.inputValue}
                        formData={modal.formData}
                        isSubmitting={isSubmitting}
                        onInputChange={(val) => setModal(prev => ({ ...prev, inputValue: val }))}
                        onFormDataChange={(updates) => setModal(prev => ({ ...prev, formData: { ...prev.formData, ...updates } }))}
                        onCancel={closeModal}
                        onConfirm={handleModalSubmit}
                    />
                )}
                <BuilderToolbar
                    isLeftSidebarOpen={isLeftSidebarOpen}
                    isRightSidebarOpen={isRightSidebarOpen}
                    onToggleLeft={() => setIsLeftSidebarOpen(!isLeftSidebarOpen)}
                    onToggleRight={() => setIsRightSidebarOpen(!isRightSidebarOpen)}
                    onBack={navigateToOverview}
                    activeFolderName={activeFolderName}
                    activeWorkflow={activeWorkflow}
                    onTitleEditStart={handleTitleEditStart}
                    nodeCount={nodes.length}
                    currentTime={currentTime}
                    onTestRun={handleTestRun}
                    isRunning={runWorkflowMutation.isPending}
                />

                <div className="flex-1 p-6 overflow-hidden flex flex-col bg-slate-50">
                    <WorkflowCanvas
                        initialNodes={nodes}
                        initialEdges={edges}
                        activeNodeId={activeNodeId}
                        onNodeClick={handleNodeClick}
                        onAddNode={handleAddNode}
                        onNodesChangeCallback={handleNodesChange}
                        onEdgesChangeCallback={handleEdgesChange}
                        draggedNode={draggedNode}
                    />
                </div>
            </main>

            {/* 3. RIGHT PANEL: Promptly Agent & Property Inspector */}
            <aside
                className={`bg-white/90 backdrop-blur-md border-l border-slate-200/60 flex flex-col h-full transition-all duration-300 relative z-20 shadow-xl shrink-0 ${
                    isRightSidebarOpen ? 'w-[340px]' : 'w-0 opacity-0 overflow-hidden border-none'
                }`}
            >
                <div className="flex border-b border-slate-200/60 shrink-0">
                    <button
                        onClick={() => setRightTab('chat')}
                        className={`flex-1 py-3 px-1 text-center text-sm truncate font-medium transition-all border-b-2 ${
                            rightTab === 'chat'
                                ? 'border-indigo-600 text-indigo-600 bg-indigo-50/30'
                                : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                        }`}
                    >
                        Promptly Agent
                    </button>
                    <button
                        onClick={() => setRightTab('properties')}
                        className={`flex-1 py-3 px-1 text-center text-sm truncate font-medium transition-all border-b-2 ${
                            rightTab === 'properties'
                                ? 'border-indigo-600 text-indigo-600 bg-indigo-50/30'
                                : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                        }`}
                    >
                        Properties
                    </button>
                    <button
                        onClick={() => setIsRightSidebarOpen(false)}
                        className="px-3 py-3 text-slate-400 hover:text-slate-700 hover:bg-slate-50 border-b-2 border-transparent transition-colors"
                        title="Close Panel"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
                <div className="flex-1 overflow-hidden">
                    {rightTab === 'chat' ? (
                        <AIAgentChat onApplyAction={handleApplyAction} />
                    ) : (
                        <PropertyInspector activeNode={activeNode} onUpdateNode={handleUpdateNode} nodes={nodes} edges={edges} />
                    )}
                </div>
            </aside>

            {/* Execution results panel */}
            <ExecutionPanel
                isOpen={isExecutionPanelOpen}
                onClose={() => setIsExecutionPanelOpen(false)}
                log={lastExecutionLog}
                isLoading={runWorkflowMutation.isPending}
            />
        </div>
    );
};

export default WorkflowBuilderView;

