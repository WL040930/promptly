import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import WorkflowCanvas from './components/canvas/WorkflowCanvas';
import PropertyInspector from './components/panels/PropertyInspector';
import AIAgentChat from './components/sidebars/AIAgentChat';
import NodeLibrarySidebar from './components/sidebars/NodeLibrarySidebar';
import BuilderToolbar from './components/layout/BuilderToolbar';
import OverviewModal from './overview/OverviewModal';
import { MODAL_TYPES, MODAL_CONFIG } from './overview/constants.js';
import TestRunModal from './components/modals/TestRunModal';
import VersionHistorySidebar from './components/sidebars/VersionHistorySidebar';
import { navigate } from '../utils/router.js';
import { useWorkflow, useCreateWorkflow, useUpdateWorkflow, useSaveWorkflowVersion } from '../api/hooks/useWorkflows.js';
import { useRunWorkflow } from '../api/hooks/useRunWorkflow.js';
import { useCreateForm, useUpdateForm } from '../api/hooks/useForms.js';
import ExecutionPanel from './components/panels/ExecutionPanel';
import BuilderLoadingSkeleton from './components/layout/BuilderLoadingSkeleton.jsx';
import { useUndoRedo } from '../hooks/useUndoRedo';
import { useToast } from '../context/ToastContext.jsx';

const WorkflowBuilderView = ({ route, isSidebarCollapsed, setSidebarCollapsed }) => {
    // ── Server data ──────────────────────────────────────────────────────────
    const activeWorkflowId = route?.automationId || null;
    const { data: activeWorkflowData, isPending: isActiveWorkflowPending } = useWorkflow(activeWorkflowId);

    const [activeNodeId, setActiveNodeId] = useState(null);
    const createWorkflowMutation = useCreateWorkflow();
    const updateWorkflowMutation = useUpdateWorkflow();
    const saveVersionMutation = useSaveWorkflowVersion();
    const createFormMutation = useCreateForm();
    const updateFormMutation = useUpdateForm();
    const toast = useToast();

    // Only show skeleton on initial load (no data yet), not on background refetches
    const loading = isActiveWorkflowPending && !activeWorkflowData;

    // ── UI state ─────────────────────────────────────────────────────────────
    const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(() => !window.matchMedia?.('(max-width: 767px)').matches);
    const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(() => !window.matchMedia?.('(max-width: 767px)').matches);
    const [isHistorySidebarOpen, setIsHistorySidebarOpen] = useState(false);
    const [rightTab, setRightTab] = useState('chat');
    const [draggedNode, setDraggedNode] = useState(null);
    const [modal, setModal] = useState({ isOpen: false, type: null, data: null, inputValue: '', formData: {} });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const previousGlobalSidebarState = useRef(null);
    const wasBuilderRoute = useRef(false);

    // The builder temporarily collapses the global sidebar, then restores the
    // state the user had before entering it.
    useEffect(() => {
        const restoreGlobalSidebar = () => {
            if (!wasBuilderRoute.current) return;
            setSidebarCollapsed?.(previousGlobalSidebarState.current ?? false);
            previousGlobalSidebarState.current = null;
            wasBuilderRoute.current = false;
        };

        if (!setSidebarCollapsed) return undefined;

        if (!wasBuilderRoute.current) {
            previousGlobalSidebarState.current = isSidebarCollapsed;
            wasBuilderRoute.current = true;
        }

        setSidebarCollapsed(true);
        return restoreGlobalSidebar;
    }, [setSidebarCollapsed]);

    // ── Execution panel state ─────────────────────────────────────────────
    const [isExecutionPanelOpen, setIsExecutionPanelOpen] = useState(false);
    const [isTestRunModalOpen, setIsTestRunModalOpen] = useState(false);
    const [lastExecutionLog, setLastExecutionLog] = useState(null);
    const runWorkflowMutation = useRunWorkflow();

    const handleTestRunClick = () => {
        if (!activeWorkflowId) return;
        setIsTestRunModalOpen(true);
    };

    const handleTestRunConfirm = async (payload) => {
        setIsTestRunModalOpen(false);
        setIsExecutionPanelOpen(true);
        setLastExecutionLog(null);
        try {
            const log = await runWorkflowMutation.mutateAsync({ workflowId: activeWorkflowId, payload, revisionId: activeWorkflowData?.draftRevisionId || null });
            setLastExecutionLog(log);
        } catch (err) {
            setLastExecutionLog({ status: 'Failed', durationMs: 0, steps: [], error: err.message });
        }
    };

    // Real-time relative timestamp ticker removed for performance, handled by child components now

    // ── Derived data ─────────────────────────────────────────────────────────
    const activeWorkflow = activeWorkflowData || null;
    const nodes = useMemo(() => activeWorkflow?.nodes || [], [activeWorkflow?.nodes]);
    const edges = useMemo(() => activeWorkflow?.edges || [], [activeWorkflow?.edges]);
    const activeNode = useMemo(() => nodes.find(n => n.id === activeNodeId) || null, [nodes, activeNodeId]);

    const { takeSnapshot, undo, redo } = useUndoRedo(20);

    // ── Workflow mutation helpers ─────────────────────────────────────────────
    const handleWorkflowUpdate = useCallback((updatedFields, skipSnapshot = false) => {
        if (!activeWorkflowId) return;

        if (!skipSnapshot && (updatedFields.nodes || updatedFields.edges)) {
            takeSnapshot({ nodes, edges });
        }

        updateWorkflowMutation.mutate({ id: activeWorkflowId, data: updatedFields });
    }, [activeWorkflowId, updateWorkflowMutation, nodes, edges, takeSnapshot]);

    const handleToggleActive = useCallback(() => {
        if (!activeWorkflow) return;
        handleWorkflowUpdate({ isActive: !activeWorkflow.isActive });
    }, [activeWorkflow, handleWorkflowUpdate]);

    const handleSaveVersion = useCallback(() => {
        if (!activeWorkflowId) return;
        saveVersionMutation.mutate(activeWorkflowId, {
            onSuccess: () => toast.success('New version snapshot saved!'),
            onError: () => toast.error('Failed to save version')
        });
    }, [activeWorkflowId, saveVersionMutation, toast]);

    // ── Undo / Redo Keybinds ──────────────────────────────────────────────────
    const handleUndo = useCallback(() => {
        const previousState = undo({ nodes, edges });
        if (previousState) {
            handleWorkflowUpdate(previousState, true);
        }
    }, [undo, nodes, edges, handleWorkflowUpdate]);

    const handleRedo = useCallback(() => {
        const nextState = redo({ nodes, edges });
        if (nextState) {
            handleWorkflowUpdate(nextState, true);
        }
    }, [redo, nodes, edges, handleWorkflowUpdate]);

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
            const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

            if (cmdOrCtrl && e.key.toLowerCase() === 'z') {
                if (e.shiftKey) {
                    e.preventDefault();
                    handleRedo();
                } else {
                    e.preventDefault();
                    handleUndo();
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleUndo, handleRedo]);

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
                const nameValue = modal.formData.name?.trim() || 'Untitled Automation';
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

    const handleTitleEditStart = useCallback(() => {
        openModal(MODAL_TYPES.EDIT_WORKFLOW_PROPERTIES, {
            currentName: activeWorkflow?.name,
            icon: activeWorkflow?.icon,
            iconBg: activeWorkflow?.iconBg,
            iconColor: activeWorkflow?.iconColor,
        });
    }, [activeWorkflow, openModal]);

    // ── Node operations ──────────────────────────────────────────────────────
    const handleNodeClick = useCallback((nodeId) => {
        setActiveNodeId(nodeId);
        setRightTab('properties');
        setIsRightSidebarOpen(true);
    }, []);

    const generateUniqueTitle = useCallback((baseTitle, excludeNodeId = null) => {
        let uniqueTitle = baseTitle;
        let counter = 2;
        let isUnique = false;

        while (!isUnique) {
            const exists = nodes.some(n => n.id !== excludeNodeId && (n.title || n.subType || n.id) === uniqueTitle);
            if (!exists) {
                isUnique = true;
            } else {
                uniqueTitle = `${baseTitle} (${counter})`;
                counter++;
            }
        }
        return uniqueTitle;
    }, [nodes]);

    const attachedFormId = useMemo(() => {
        const formNode = nodes.find(node => node.subType === 'form-submission');
        return formNode?.config?.formId || null;
    }, [nodes]);

    const handleApplyAction = useCallback(async (message) => {
        const payload = message.payload || {};
        if (message.kind === 'form_proposal') {
            const schema = payload.schema || {};
            const formData = {
                title: schema.title || 'New Promptly Form',
                description: schema.description || '',
                settings: schema.settings || {},
                fields: schema.fields || []
            };
            const saved = payload.formId
                ? await updateFormMutation.mutateAsync({ id: payload.formId, data: formData })
                : await createFormMutation.mutateAsync(formData);
            return { formId: saved.id };
        }

        if (message.kind === 'workflow_diff') {
            if (payload.baseWorkflowUpdatedAt && activeWorkflow?.updatedAt && payload.baseWorkflowUpdatedAt !== activeWorkflow.updatedAt) {
                throw new Error('This workflow changed while the proposal was open. Please generate the changes again.');
            }
            await updateWorkflowMutation.mutateAsync({ id: activeWorkflowId, data: { nodes: payload.nodes, edges: payload.edges } });
            return { workflowId: activeWorkflowId };
        }

        if (message.kind === 'workflow_proposal') {
            if (payload.baseWorkflowUpdatedAt && activeWorkflow?.updatedAt && payload.baseWorkflowUpdatedAt !== activeWorkflow.updatedAt) {
                throw new Error('This workflow changed while the proposal was open. Please generate the workflow again.');
            }
            const hasCurrentNodes = nodes.length > 0;
            let targetWorkflowId = activeWorkflowId;
            if (hasCurrentNodes) {
                const replace = window.confirm('This workflow already has nodes. Choose OK to replace it, or Cancel to create a separate workflow.');
                if (!replace) {
                    const created = await createWorkflowMutation.mutateAsync({
                        name: payload.name || 'New Automation',
                        status: 'Draft',
                        iconColor: 'text-indigo-600',
                        iconBg: 'bg-indigo-100',
                        nodes: payload.nodes || [],
                        edges: payload.edges || []
                    });
                    targetWorkflowId = created.id;
                    toast.success('Created a separate automation from the proposal.');
                    return { workflowId: targetWorkflowId };
                }
            }
            await updateWorkflowMutation.mutateAsync({ id: targetWorkflowId, data: { name: payload.name || activeWorkflow?.name || 'New Automation', nodes: payload.nodes || [], edges: payload.edges || [] } });
            toast.success('Automation proposal applied.');
            return { workflowId: targetWorkflowId };
        }
        return null;
    }, [activeWorkflow, activeWorkflowId, createFormMutation, createWorkflowMutation, nodes, toast, updateFormMutation, updateWorkflowMutation]);

    const handleAddNode = useCallback((nodeData, position) => {
        const newNodeId = `${activeWorkflowId}-${Date.now()}`;
        const baseTitle = nodeData.title || nodeData.subType || nodeData.type;
        const uniqueTitle = generateUniqueTitle(baseTitle);

        const updatedNodes = [...nodes, {
            id: newNodeId,
            type: nodeData.type,
            subType: nodeData.subType,
            title: uniqueTitle,
            description: nodeData.description,
            schema: nodeData.schema,
            icon: nodeData.icon,
            bgColor: nodeData.bgColor || nodeData.iconBg,
            color: nodeData.color || nodeData.iconColor,
            iconColor: nodeData.iconColor || nodeData.color,
            position
        }];
        handleWorkflowUpdate({ nodes: updatedNodes });
        setActiveNodeId(newNodeId);
    }, [activeWorkflowId, nodes, handleWorkflowUpdate, generateUniqueTitle]);

    const handleNodesChange = useCallback((changes) => {
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
    }, [nodes, activeNodeId, handleWorkflowUpdate]);

    const handleEdgesChange = useCallback((updatedEdges) => {
        handleWorkflowUpdate({ edges: updatedEdges });
    }, [handleWorkflowUpdate]);

    const handleUpdateNode = useCallback((nodeId, updatedFields) => {
        let updatedNodes = [...nodes];
        let oldTitle = null;
        let newTitle = null;
        let refactoredCount = 0;

        updatedNodes = updatedNodes.map(node => {
            if (node.id !== nodeId) return node;

            const nextNode = { ...node, ...updatedFields };

            if (updatedFields.title !== undefined) {
                oldTitle = node.title || node.subType || node.id;
                const requestedTitle = updatedFields.title || node.subType || node.id;
                // Enforce uniqueness, excluding self
                newTitle = generateUniqueTitle(requestedTitle, nodeId);
                nextNode.title = newTitle;
            }

            if (updatedFields.config && node.config) {
                nextNode.config = { ...node.config, ...updatedFields.config };
            }
            return nextNode;
        });

        // Auto-refactor downstream nodes if title changed
        if (oldTitle && newTitle && oldTitle !== newTitle) {
            function escapeRegExp(string) {
                return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            }
            const regex = new RegExp(`\\{\\{${escapeRegExp(oldTitle)}\\.`, 'g');

            updatedNodes = updatedNodes.map(node => {
                if (node.id === nodeId) return node;
                let configStr = JSON.stringify(node.config || {});
                if (regex.test(configStr)) {
                    configStr = configStr.replace(regex, `{{${newTitle}.`);
                    refactoredCount++;
                    return { ...node, config: JSON.parse(configStr) };
                }
                return node;
            });

            if (refactoredCount > 0) {
                toast.success(`Updated references in ${refactoredCount} downstream node${refactoredCount !== 1 ? 's' : ''}.`);
            }
        }

        handleWorkflowUpdate({ nodes: updatedNodes });
    }, [nodes, handleWorkflowUpdate, generateUniqueTitle, toast]);

    // ── GSAP entrance animation ───────────────────────────────────────────────
    const builderContainer = useRef(null);
    useGSAP(() => {
        if (builderContainer.current) {
            gsap.from(builderContainer.current, { opacity: 0, duration: 0.3, ease: 'power2.out' });
        }
    }, []);

    // ── GSAP Right Panel Animations ───────────────────────────────────────────
    const rightPanelContentRef = useRef(null);
    useGSAP(() => {
        if (rightPanelContentRef.current) {
            gsap.fromTo(rightPanelContentRef.current,
                { opacity: 0, x: 15 },
                { opacity: 1, x: 0, duration: 0.3, ease: 'power2.out', clearProps: 'all' }
            );
        }
    }, { dependencies: [isHistorySidebarOpen, rightTab] });

    if (loading) {
        return <BuilderLoadingSkeleton />;
    }

    // ── Builder view ─────────────────────────────────────────────────────────
    return (
        <div ref={builderContainer} className="relative flex h-full w-full flex-1 overflow-hidden bg-slate-50 font-sans">

            {/* 1. LEFT SIDEBAR: Add steps */}
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
                    onBack={() => navigate('/app/automations')}
                    activeWorkflow={activeWorkflow}
                    onTitleEditStart={handleTitleEditStart}
                    nodeCount={nodes.length}
                    onTestRun={handleTestRunClick}
                    isRunning={runWorkflowMutation.isPending}
                    isSavingVersion={saveVersionMutation.isPending}
                    onSaveVersion={handleSaveVersion}
                    onToggleHistory={() => {
                        setIsHistorySidebarOpen(!isHistorySidebarOpen);
                        if (!isHistorySidebarOpen && !isRightSidebarOpen) {
                            setIsRightSidebarOpen(true);
                        }
                    }}
                    onToggleActive={handleToggleActive}
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



            {/* 3. RIGHT PANEL: AI assistant & configuration */}
            <aside
                className={`absolute inset-y-0 right-0 z-30 flex h-full shrink-0 flex-col border-l border-slate-200/60 bg-white/95 backdrop-blur-md transition-all duration-300 shadow-2xl md:relative md:inset-auto md:z-20 md:shadow-xl ${isRightSidebarOpen ? 'w-[min(340px,100vw)]' : 'w-0 overflow-hidden border-none opacity-0'
                    }`}
            >
                <div className="flex border-b border-slate-200/60 shrink-0">
                    {isHistorySidebarOpen ? (
                        <>
                            <div className="flex-1 py-3 px-4 text-sm font-semibold text-slate-800 flex items-center">
                                Version History
                            </div>
                            <button
                                onClick={() => setIsHistorySidebarOpen(false)}
                                className="px-3 py-3 text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-colors border-b-2 border-transparent"
                                title="Back to Tools"
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                    <line x1="18" y1="6" x2="6" y2="18"></line>
                                    <line x1="6" y1="6" x2="18" y2="18"></line>
                                </svg>
                            </button>
                        </>
                    ) : (
                        <>
                            <button
                                onClick={() => setRightTab('chat')}
                                className={`flex-1 py-3 px-1 text-center text-sm truncate font-medium transition-all border-b-2 ${rightTab === 'chat'
                                        ? 'border-indigo-600 text-indigo-600 bg-indigo-50/30'
                                        : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                                    }`}
                            >
                                AI Assistant
                            </button>
                            <button
                                onClick={() => setRightTab('properties')}
                                className={`flex-1 py-3 px-1 text-center text-sm truncate font-medium transition-all border-b-2 ${rightTab === 'properties'
                                        ? 'border-indigo-600 text-indigo-600 bg-indigo-50/30'
                                        : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                                    }`}
                            >
                                Configure
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
                        </>
                    )}
                </div>
                <div ref={rightPanelContentRef} className="flex-1 overflow-hidden">
                    {isHistorySidebarOpen ? (
                        <VersionHistorySidebar workflowId={activeWorkflowId} currentWorkflow={activeWorkflow} />
                    ) : (
                        rightTab === 'chat' ? (
                            <AIAgentChat workflow={activeWorkflow} formId={attachedFormId} onApplyProposal={handleApplyAction} />
                        ) : (
                            <PropertyInspector activeNode={activeNode} onUpdateNode={handleUpdateNode} onTestWorkflow={handleTestRunClick} nodes={nodes} edges={edges} />
                        )
                    )}
                </div>
            </aside>

            {/* Test Run Modal */}
            <TestRunModal
                isOpen={isTestRunModalOpen}
                onClose={() => setIsTestRunModalOpen(false)}
                onConfirm={handleTestRunConfirm}
                isLoading={runWorkflowMutation.isPending}
                workflowId={activeWorkflowId}
                nodes={nodes}
            />

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
