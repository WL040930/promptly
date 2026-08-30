import { Suspense, lazy, useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { X, Sliders } from 'lucide-react';
import PropertyInspector from './components/panels/PropertyInspector';
import NodeLibrarySidebar from './components/sidebars/NodeLibrarySidebar';
import BuilderToolbar from './components/layout/BuilderToolbar';
import OverviewModal from './overview/OverviewModal';
import { MODAL_TYPES, MODAL_CONFIG } from './overview/constants.js';
import TestRunModal from './components/modals/TestRunModal';
import VersionHistorySidebar from './components/sidebars/VersionHistorySidebar';
import { navigate, navigateTo } from '../utils/router.js';
import { useForm } from '../api/hooks/useForms.js';
import { useWorkflow, useUpdateWorkflow, usePublishWorkflow, usePauseWorkflow } from '../api/hooks/useWorkflows.js';
import { useRunWorkflow } from '../api/hooks/useRunWorkflow.js';
import ExecutionPanel from './components/panels/ExecutionPanel';
import BuilderLoadingSkeleton from './components/layout/BuilderLoadingSkeleton.jsx';
import { useUndoRedo } from '../hooks/useUndoRedo';
import { useToast } from '../context/ToastContext.jsx';
import { useWorkspaceScope } from '../context/WorkspaceScopeContext.jsx';
import ConfirmModal from '../components/modals/ConfirmModal.jsx';
import { cloneWorkflowNodeForPaste } from './utils/nodeClipboard.js';
import { WORKFLOW_MODAL_LAYERS } from './modalLayers.js';
import { createDebouncedSaveQueue } from '../utils/formAutosave.js';
import { applyWorkflowNodeChanges } from '../utils/workflowMutationReconciliation.js';
import { planDanglingWorkflowReferenceRepair, planWorkflowNodeDeletion } from '../../../shared/workflowDeletion.js';

const WorkflowCanvas = lazy(() => import('./components/canvas/WorkflowCanvas'));
const WorkflowAIAssistant = lazy(() => import('./components/sidebars/WorkflowAIAssistant.jsx'));

function NodeConfigModal({ isOpen, onClose, activeNode, onUpdateNode, onTestWorkflow, nodes, edges }) {
    const modalRef = useRef(null);
    const overlayRef = useRef(null);

    useGSAP(() => {
        if (isOpen && overlayRef.current && modalRef.current) {
            gsap.fromTo(overlayRef.current, { opacity: 0 }, { opacity: 1, duration: 0.2, ease: 'power2.out' });
            gsap.fromTo(modalRef.current, { opacity: 0, y: 15, scale: 0.96 }, { opacity: 1, y: 0, scale: 1, duration: 0.25, ease: 'back.out(1.2)' });
        }
    }, { dependencies: [isOpen] });

    if (!isOpen || !activeNode) return null;

    const handleClose = () => {
        if (overlayRef.current && modalRef.current) {
            gsap.to(overlayRef.current, { opacity: 0, duration: 0.15 });
            gsap.to(modalRef.current, { opacity: 0, y: 10, scale: 0.96, duration: 0.15, onComplete: onClose });
        } else {
            onClose();
        }
    };

    return createPortal(
        <div className="fixed inset-0 flex items-center justify-center p-4 select-none" style={{ zIndex: WORKFLOW_MODAL_LAYERS.config }}>
            <div ref={overlayRef} className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={handleClose} />
            <div ref={modalRef} className="relative bg-white w-full max-w-xl rounded-2xl shadow-2xl border border-slate-200 flex flex-col max-h-[85vh] overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200/80 bg-slate-50/70 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center font-bold shrink-0">
                            <Sliders className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                            <h3 className="text-sm font-bold text-slate-900 truncate">{activeNode?.title || activeNode?.subType || 'Configure Step'}</h3>
                            <p className="text-xs text-slate-500 font-medium truncate">Edit parameters and options for this step</p>
                        </div>
                    </div>
                    <button type="button" onClick={handleClose} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-lg transition-colors">
                        <X className="w-4 h-4" />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 select-text">
                    <PropertyInspector
                        activeNode={activeNode}
                        onUpdateNode={onUpdateNode}
                        onTestWorkflow={onTestWorkflow}
                        nodes={nodes}
                        edges={edges}
                    />
                </div>
                <div className="px-5 py-3 bg-slate-50 border-t border-slate-200/80 flex items-center justify-end shrink-0">
                    <button type="button" onClick={handleClose} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold text-xs rounded-xl shadow-xs transition-all">
                        Done
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}

function HistoryDrawer({ isOpen, onClose, workflowId, currentWorkflow }) {
    const drawerRef = useRef(null);
    const backdropRef = useRef(null);
    const [isMounted, setIsMounted] = useState(isOpen);

    useEffect(() => {
        if (isOpen) setIsMounted(true);
    }, [isOpen]);

    useGSAP(() => {
        if (!isMounted) return;
        const drawer = drawerRef.current;
        const backdrop = backdropRef.current;
        if (!drawer || !backdrop) return;

        const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        const duration = reduceMotion ? 0 : 0.28;
        const ease = 'power3.out';

        if (isOpen) {
            gsap.timeline({ defaults: { overwrite: 'auto' } })
                .set(drawer, { autoAlpha: 1, xPercent: 100 })
                .set(backdrop, { autoAlpha: 0 })
                .to(backdrop, { autoAlpha: 1, duration: duration * 0.8, ease }, 0)
                .to(drawer, { xPercent: 0, duration, ease }, 0);
        } else {
            gsap.timeline({ defaults: { overwrite: 'auto' } })
                .to(drawer, { xPercent: 100, autoAlpha: 0, duration, ease: 'power2.in', onComplete: () => setIsMounted(false) })
                .to(backdrop, { autoAlpha: 0, duration: duration * 0.8, ease: 'power2.in' }, 0);
        }
    }, { dependencies: [isOpen, isMounted], revertOnUpdate: true });

    if (!isMounted) return null;

    return (
        <>
            <div
                ref={backdropRef}
                aria-hidden="true"
                onClick={onClose}
                className={`absolute inset-0 z-30 bg-slate-900/10 backdrop-blur-[1px] ${isOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}
            />
            <aside
                ref={drawerRef}
                aria-hidden={!isOpen}
                className={`absolute inset-y-0 right-0 z-40 flex h-full w-[min(360px,100vw)] shrink-0 flex-col border-l border-slate-200/80 bg-white/95 shadow-2xl backdrop-blur-md ${isOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}
            >
                <div className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200/80 bg-slate-50/80 px-3">
                    <div className="flex flex-1 items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-800">
                        <span className="h-2 w-2 rounded-full bg-indigo-600" />
                        Version history
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close version history"
                        className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-200/60 hover:text-slate-700"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>
                <div className="min-h-0 flex-1 overflow-hidden">
                    <VersionHistorySidebar workflowId={workflowId} currentWorkflow={currentWorkflow} />
                </div>
            </aside>
        </>
    );
}

const WorkflowBuilderView = ({ route, isSidebarCollapsed, setSidebarCollapsed }) => {
    // ── Server data ──────────────────────────────────────────────────────────
    const { scope } = useWorkspaceScope();
    const activeWorkflowId = route?.automationId || null;
    const { data: activeWorkflowData, isPending: isActiveWorkflowPending } = useWorkflow(activeWorkflowId);
    const activeFormId = useMemo(
        () => (activeWorkflowData?.nodes || []).find(node => node?.subType === 'form-submission')?.config?.formId || null,
        [activeWorkflowData?.nodes]
    );
    const { data: activeFormSchema } = useForm(activeFormId);

    const [activeNodeId, setActiveNodeId] = useState(null);
    const updateWorkflowMutation = useUpdateWorkflow();
    const publishWorkflowMutation = usePublishWorkflow();
    const pauseWorkflowMutation = usePauseWorkflow();
    const toast = useToast();
    const queryClient = useQueryClient();

    // Only show skeleton on initial load (no data yet), not on background refetches
    const loading = isActiveWorkflowPending && !activeWorkflowData;

    // ── UI state ─────────────────────────────────────────────────────────────
    const [viewMode, setViewMode] = useState(() => (route?.editor === 'ai' ? 'ai' : 'canvas'));
    const initialAIPrompt = useMemo(() => new URLSearchParams(window.location.search).get('prompt') || '', [route?.automationId, route?.editor]);
    const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(() => !window.matchMedia?.('(max-width: 767px)').matches);
    const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
    const [isHistorySidebarOpen, setIsHistorySidebarOpen] = useState(false);
    const [isPublishConfirmOpen, setIsPublishConfirmOpen] = useState(false);
    const [draggedNode, setDraggedNode] = useState(null);
    const [modal, setModal] = useState({ isOpen: false, type: null, data: null, inputValue: '', formData: {} });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [pendingDeletionPlan, setPendingDeletionPlan] = useState(null);
    const previousGlobalSidebarState = useRef(null);
    const wasBuilderRoute = useRef(false);
    const workflowRevisionRef = useRef(null);
    const workflowRevisionIdRef = useRef(null);
    const workflowSaveQueueRef = useRef(null);
    const workflowGraphRef = useRef({ nodes: [], edges: [] });
    const handleUndoRef = useRef(null);
    const updateWorkflowMutationRef = useRef(updateWorkflowMutation.mutateAsync);

    useEffect(() => {
        updateWorkflowMutationRef.current = updateWorkflowMutation.mutateAsync;
    }, [updateWorkflowMutation.mutateAsync]);

    useEffect(() => {
        setViewMode(route?.editor === 'ai' ? 'ai' : 'canvas');
    }, [route?.automationId, route?.editor]);

    const openDanglingRepairIfNeeded = useCallback(() => {
        const repair = planDanglingWorkflowReferenceRepair({
            nodes: workflowGraphRef.current.nodes,
            edges: workflowGraphRef.current.edges,
            formSchema: activeFormSchema,
            schemaForNode: node => node?.schema || node?.configSchema || {}
        });
        if (!repair.canApply || !repair.requiresReview) return false;
        setPendingDeletionPlan(previous => previous || { ...repair, mode: 'recovery' });
        return true;
    }, [activeFormSchema]);

    useEffect(() => {
        if (!activeWorkflowId) {
            workflowRevisionIdRef.current = null;
            workflowRevisionRef.current = null;
            return;
        }
        if (workflowRevisionIdRef.current !== activeWorkflowId) {
            workflowRevisionIdRef.current = activeWorkflowId;
            workflowRevisionRef.current = activeWorkflowData?.revision ?? null;
            return;
        }
        const serverRevision = activeWorkflowData?.revision;
        if (serverRevision !== undefined && serverRevision !== null
            && (workflowRevisionRef.current === null || Number(serverRevision) > Number(workflowRevisionRef.current))) {
            workflowRevisionRef.current = serverRevision;
        }
    }, [activeWorkflowId, activeWorkflowData?.revision]);

    useEffect(() => {
        if (!activeWorkflowId) {
            workflowSaveQueueRef.current = null;
            return undefined;
        }

        const queue = createDebouncedSaveQueue({
            delay: 650,
            onError: error => {
                const issues = Array.isArray(error?.payload?.issues) ? error.payload.issues : [];
                const hasDanglingReference = issues.some(issue => (
                    issue?.code === 'WORKFLOW_REFERENCE_SOURCE_UNKNOWN'
                    || issue?.code === 'WORKFLOW_REFERENCE_FIELD_MISSING'
                    || /step that no longer exists/i.test(issue?.message || '')
                    || /form field no longer exists/i.test(issue?.message || '')
                ));
                if (hasDanglingReference) {
                    const repair = planDanglingWorkflowReferenceRepair({
                        nodes: workflowGraphRef.current.nodes,
                        edges: workflowGraphRef.current.edges,
                        formSchema: activeFormSchema,
                        schemaForNode: node => node?.schema || node?.configSchema || {}
                    });
                    if (repair.canApply && repair.requiresReview) {
                        setPendingDeletionPlan({ ...repair, mode: 'recovery' });
                        return;
                    }
                }
                toast.error(error.message || 'Could not save workflow.');
            },
            save: async updatedFields => {
                const data = { ...updatedFields };
                if ((updatedFields.nodes || updatedFields.edges)
                    && workflowRevisionRef.current !== null
                    && workflowRevisionRef.current !== undefined) {
                    data.expectedRevision = workflowRevisionRef.current;
                }
                const result = await updateWorkflowMutationRef.current({ id: activeWorkflowId, data });
                if (result?.revision !== undefined && result?.revision !== null) {
                    workflowRevisionRef.current = result.revision;
                }
                if (Array.isArray(result?.draftWarnings) && result.draftWarnings.length > 0) {
                    const repair = planDanglingWorkflowReferenceRepair({
                        nodes: Array.isArray(data.nodes) ? data.nodes : workflowGraphRef.current.nodes,
                        edges: Array.isArray(data.edges) ? data.edges : workflowGraphRef.current.edges,
                        formSchema: activeFormSchema,
                        schemaForNode: node => node?.schema || node?.configSchema || {}
                    });
                    if (repair.canApply && repair.requiresReview) {
                        setPendingDeletionPlan(previous => previous || { ...repair, mode: 'recovery' });
                    }
                    toast.info('Draft saved with broken references. Repair them before publishing or running it.');
                }
                return result;
            }
        });
        workflowSaveQueueRef.current = queue;
        return () => {
            void queue.flush().catch(() => {});
            if (workflowSaveQueueRef.current === queue) workflowSaveQueueRef.current = null;
        };
    }, [activeFormSchema, activeWorkflowId, toast]);

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
    const [runMode, setRunMode] = useState('test');
    const [lastExecutionRunType, setLastExecutionRunType] = useState('test');
    const [lastExecutionLog, setLastExecutionLog] = useState(null);
    const runWorkflowMutation = useRunWorkflow();

    const handleTestRunClick = () => {
        if (!activeWorkflowId) return;
        if (openDanglingRepairIfNeeded()) return;
        setRunMode('test');
        setIsTestRunModalOpen(true);
    };

    const handleProductionRunClick = () => {
        if (!activeWorkflowId) return;
        if (openDanglingRepairIfNeeded()) return;
        if (!activeWorkflowData?.publishedRevisionId || !activeWorkflowData?.isActive) {
            toast.error('Publish and activate this automation before running it live.');
            return;
        }
        setRunMode('production');
        setIsTestRunModalOpen(true);
    };

    const handleRunConfirm = async (payload) => {
        const mode = runMode === 'production' ? 'production' : 'test';
        setIsTestRunModalOpen(false);
        setIsExecutionPanelOpen(true);
        setLastExecutionRunType(mode);
        setLastExecutionLog(null);
        try {
            const log = await runWorkflowMutation.mutateAsync({
                workflowId: activeWorkflowId,
                payload,
                // Test the current working draft, including edits that have
                // not been committed to version history yet.
                revisionId: null,
                runType: mode
            });
            setLastExecutionLog(log);
        } catch (err) {
            setLastExecutionLog({ status: 'failed', durationMs: 0, steps: [], error: err.message });
        }
    };

    // ── Derived data ─────────────────────────────────────────────────────────
    const activeWorkflow = activeWorkflowData || null;
    const nodes = useMemo(() => activeWorkflow?.nodes || [], [activeWorkflow?.nodes]);
    const edges = useMemo(() => activeWorkflow?.edges || [], [activeWorkflow?.edges]);
    const activeNode = useMemo(() => nodes.find(n => n.id === activeNodeId) || null, [nodes, activeNodeId]);
    const workflowSchemaForNode = useCallback(node => node?.schema || node?.configSchema || {}, []);

    useEffect(() => {
        workflowGraphRef.current = { nodes, edges };
    }, [nodes, edges]);

    const { takeSnapshot, undo, redo } = useUndoRedo(20);

    // ── Workflow mutation helpers ─────────────────────────────────────────────
    const handleWorkflowUpdate = useCallback((updatedFields, skipSnapshot = false) => {
        if (!activeWorkflowId) return Promise.resolve(null);

        if (!skipSnapshot && (updatedFields.nodes || updatedFields.edges)) {
            takeSnapshot({ nodes, edges });
        }

        // Keep the editor responsive immediately, then persist one latest
        // graph snapshot after the user pauses. The queue is single-flight so
        // a high-latency database cannot reorder writes or build a backlog.
        queryClient.setQueryData(['workflows', activeWorkflowId, { scope }], current =>
            current ? { ...current, ...updatedFields } : current
        );
        workflowSaveQueueRef.current?.schedule(updatedFields);
        return Promise.resolve(null);
    }, [activeWorkflowId, queryClient, nodes, edges, takeSnapshot, scope]);

    const flushPendingWorkflowSave = useCallback(() => workflowSaveQueueRef.current?.flush() || Promise.resolve(null), []);

    const handleViewModeChange = useCallback(mode => {
        if (!activeWorkflowId) return;
        const editor = mode === 'ai' ? 'ai' : 'visual';
        if (route?.editor === editor) return;
        navigateTo({
            page: 'automation-build',
            automationId: activeWorkflowId,
            editor,
            ...(route?.prompt ? { prompt: route.prompt } : {})
        });
    }, [activeWorkflowId, route?.editor, route?.prompt]);

    const publishWorkflow = useCallback(async ({ closeConfirmOnSuccess = false } = {}) => {
        if (!activeWorkflowId) return;
        if (openDanglingRepairIfNeeded()) return;
        try {
            // Finish any in-flight draft save before checking the publish
            // boundary. Publishing itself never creates a history entry.
            await flushPendingWorkflowSave();
            await publishWorkflowMutation.mutateAsync(activeWorkflowId);
            toast.success('Automation published. Live runs now use this release.');
            if (closeConfirmOnSuccess) setIsPublishConfirmOpen(false);
        } catch (error) {
            toast.error(error.message || 'Could not publish automation. Save a version first.');
        }
    }, [activeWorkflow?.publishedRevisionId, activeWorkflowId, flushPendingWorkflowSave, openDanglingRepairIfNeeded, publishWorkflowMutation, toast]);

    const handlePublishWorkflow = useCallback(() => {
        if (!activeWorkflowId) return;
        setIsPublishConfirmOpen(true);
    }, [activeWorkflowId]);

    const handlePauseWorkflow = useCallback(async () => {
        if (!activeWorkflowId) return;
        try {
            await pauseWorkflowMutation.mutateAsync(activeWorkflowId);
            toast.success('Automation paused. Your draft and released version are unchanged.');
        } catch (error) {
            toast.error(error.message || 'Could not pause automation.');
        }
    }, [activeWorkflowId, pauseWorkflowMutation, toast]);

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
        handleUndoRef.current = handleUndo;
    }, [handleUndo]);

    const closeDeletionReview = useCallback(() => {
        setPendingDeletionPlan(null);
    }, []);

    const confirmDeletionReview = useCallback(() => {
        const plan = pendingDeletionPlan;
        if (!plan?.canApply) return;

        const focusNodeId = plan.impact?.affectedNodeIds?.[0] || null;
        handleWorkflowUpdate({ nodes: plan.nodes, edges: plan.edges });
        setPendingDeletionPlan(null);

        if (plan.mode === 'recovery') {
            toast.success('Cleared the broken references. Review the affected step before saving again.');
        } else {
            toast.success('Step deleted and affected values cleared.', {
                action: { label: 'Undo', onClick: () => handleUndoRef.current?.() }
            });
        }

        if (focusNodeId) {
            setActiveNodeId(focusNodeId);
            setIsConfigModalOpen(true);
        } else if (plan.mode !== 'recovery') {
            setActiveNodeId(null);
            setIsConfigModalOpen(false);
        }
    }, [pendingDeletionPlan, handleWorkflowUpdate, toast]);

    const handleApplyLayout = useCallback((laidOutNodes, mode) => {
        if (!Array.isArray(laidOutNodes)) return;
        const nextNodes = laidOutNodes.map(node => ({
            ...node,
            layoutPinned: mode === 'all' ? false : node.layoutPinned !== false
        }));
        handleWorkflowUpdate({ nodes: nextNodes });
        toast.success(mode === 'all' ? 'Workflow re-laid out.' : 'Unpinned steps tidied.', {
            action: { label: 'Undo', onClick: handleUndo }
        });
    }, [handleWorkflowUpdate, toast, handleUndo]);

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
        setIsConfigModalOpen(true);
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
            position,
            layoutPinned: true
        }];
        handleWorkflowUpdate({ nodes: updatedNodes });
        setActiveNodeId(newNodeId);
    }, [activeWorkflowId, nodes, handleWorkflowUpdate, generateUniqueTitle]);

    const handlePasteNode = useCallback((sourceNode, offset = 40) => {
        if (!sourceNode) return;

        const basePosition = sourceNode.position || { x: 0, y: 0 };
        let nextOffset = Math.max(40, Number(offset) || 40);
        let position = {
            x: basePosition.x + nextOffset,
            y: basePosition.y + nextOffset
        };
        while (nodes.some(node => node.position?.x === position.x && node.position?.y === position.y)) {
            nextOffset += 40;
            position = {
                x: basePosition.x + nextOffset,
                y: basePosition.y + nextOffset
            };
        }

        const baseTitle = sourceNode.title || sourceNode.subType || sourceNode.type || 'Node';
        const pastedTitle = generateUniqueTitle(baseTitle);
        const newNodeId = `${activeWorkflowId}-paste-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const pastedNode = cloneWorkflowNodeForPaste(sourceNode, {
            id: newNodeId,
            title: pastedTitle,
            position
        });
        if (!pastedNode) return;

        pastedNode.layoutPinned = true;

        handleWorkflowUpdate({ nodes: [...nodes, pastedNode] });
        setActiveNodeId(newNodeId);
        toast.success(`Pasted ${pastedTitle}.`);
    }, [activeWorkflowId, nodes, handleWorkflowUpdate, generateUniqueTitle, toast]);

    const handleNodesChange = useCallback((changes) => {
        const positionChanges = changes.filter(c => c.type === 'position' && c.position && !c.dragging);
        const removeChanges = changes.filter(c => c.type === 'remove');
        if (positionChanges.length === 0 && removeChanges.length === 0) return;

        const positioned = applyWorkflowNodeChanges({
            nodes,
            edges,
            changes: positionChanges
        });

        if (removeChanges.length === 0) {
            handleWorkflowUpdate(positioned);
            return;
        }

        const deletionPlan = planWorkflowNodeDeletion({
            nodes: positioned.nodes,
            edges,
            nodeIds: removeChanges.map(change => change.id),
            schemaForNode: workflowSchemaForNode
        });
        if (!deletionPlan.canApply) {
            toast.error('This step cannot be deleted until its broken references are repaired.');
            return;
        }
        if (deletionPlan.requiresReview) {
            setPendingDeletionPlan({ ...deletionPlan, mode: 'delete' });
            return;
        }

        handleWorkflowUpdate({ nodes: deletionPlan.nodes, edges: deletionPlan.edges });
        const removeIds = removeChanges.map(change => change.id);
        if (removeIds.includes(activeNodeId)) {
            setActiveNodeId(null);
            setIsConfigModalOpen(false);
        }
    }, [nodes, edges, activeNodeId, handleWorkflowUpdate, workflowSchemaForNode, toast]);

    const handleToggleLayoutPin = useCallback((nodeId) => {
        const node = nodes.find(item => item.id === nodeId);
        if (!node) return;
        handleWorkflowUpdate({ nodes: nodes.map(item => item.id === nodeId
            ? { ...item, layoutPinned: item.layoutPinned === false }
            : item) });
    }, [nodes, handleWorkflowUpdate]);

    const handleEdgesChange = useCallback((updatedEdges) => {
        handleWorkflowUpdate({ edges: updatedEdges });
    }, [handleWorkflowUpdate]);

    const handleEdgeDelete = useCallback((edgeId) => {
        const updatedEdges = edges.filter(edge => edge.id !== edgeId);
        if (updatedEdges.length !== edges.length) handleEdgesChange(updatedEdges);
    }, [edges, handleEdgesChange]);

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

    if (loading) {
        return <BuilderLoadingSkeleton mode={viewMode} />;
    }

    // ── Builder view ─────────────────────────────────────────────────────────
    return (
        <div ref={builderContainer} className="relative flex h-full w-full flex-1 overflow-hidden bg-slate-50 font-sans">

            {/* 1. LEFT SIDEBAR: Node Library (visible in canvas mode) */}
            {viewMode === 'canvas' && (
                <>
                    {isLeftSidebarOpen && <button type="button" className="builder-mobile-sidebar-backdrop" onClick={() => setIsLeftSidebarOpen(false)} aria-label="Close node library" />}
                    <NodeLibrarySidebar
                        isOpen={isLeftSidebarOpen}
                        onClose={() => setIsLeftSidebarOpen(false)}
                        onDragStart={(node) => setDraggedNode(node)}
                        onDragEnd={() => setDraggedNode(null)}
                    />
                </>
            )}

            {/* 2. CENTER: Main View + Toolbar */}
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
                    onToggleLeft={() => setIsLeftSidebarOpen(!isLeftSidebarOpen)}
                    onBack={() => navigate('/app/automations')}
                    activeWorkflow={activeWorkflow}
                    onTitleEditStart={handleTitleEditStart}
                    nodeCount={nodes.length}
                    onTestRun={handleTestRunClick}
                    onProductionRun={handleProductionRunClick}
                    isProductionReady={Boolean(activeWorkflow?.isActive && activeWorkflow?.publishedRevisionId)}
                    isRunning={runWorkflowMutation.isPending}
                    onPublish={handlePublishWorkflow}
                    isPublishing={publishWorkflowMutation.isPending}
                    onPause={handlePauseWorkflow}
                    isPausing={pauseWorkflowMutation.isPending}
                    onToggleHistory={() => setIsHistorySidebarOpen(!isHistorySidebarOpen)}
                    isHistorySidebarOpen={isHistorySidebarOpen}
                    viewMode={viewMode}
                    onViewModeChange={handleViewModeChange}
                />

                <div className="flex-1 p-0 overflow-hidden flex flex-col bg-slate-50 relative">
                    {viewMode === 'canvas' ? (
                        <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-slate-500">Loading visual editor…</div>}>
                            <WorkflowCanvas
                                initialNodes={nodes}
                                initialEdges={edges}
                                activeNodeId={activeNodeId}
                                onNodeClick={handleNodeClick}
                                onAddNode={handleAddNode}
                                onPasteNode={handlePasteNode}
                                onNodesChangeCallback={handleNodesChange}
                                onEdgesChangeCallback={handleEdgesChange}
                                onEdgeDelete={handleEdgeDelete}
                                onApplyLayout={handleApplyLayout}
                                onToggleLayoutPin={handleToggleLayoutPin}
                                draggedNode={draggedNode}
                            />
                        </Suspense>
                    ) : (
                        <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-slate-500">Loading AI editor…</div>}>
                            <WorkflowAIAssistant workflow={activeWorkflow} onBeforeSend={flushPendingWorkflowSave} initialPrompt={initialAIPrompt} />
                        </Suspense>
                    )}
                </div>
            </main>

            {/* 3. RIGHT SIDEBAR: animated version history drawer */}
            <HistoryDrawer
                isOpen={isHistorySidebarOpen}
                onClose={() => setIsHistorySidebarOpen(false)}
                workflowId={activeWorkflowId}
                currentWorkflow={activeWorkflow}
            />

            <NodeConfigModal
                isOpen={isConfigModalOpen && Boolean(activeNode)}
                onClose={() => setIsConfigModalOpen(false)}
                activeNode={activeNode}
                onUpdateNode={handleUpdateNode}
                onTestWorkflow={handleTestRunClick}
                nodes={nodes}
                edges={edges}
            />

            {/* Test Run Modal — rendered above node configuration */}
            <TestRunModal
                isOpen={isTestRunModalOpen}
                onClose={() => setIsTestRunModalOpen(false)}
                onConfirm={handleRunConfirm}
                isLoading={runWorkflowMutation.isPending}
                workflowId={activeWorkflowId}
                nodes={nodes}
                runType={runMode}
            />

            <ConfirmModal
                isOpen={isPublishConfirmOpen}
                onClose={() => setIsPublishConfirmOpen(false)}
                onConfirm={() => void publishWorkflow({ closeConfirmOnSuccess: true })}
                title="Publish and activate automation?"
                message="Publishing makes this automation live and may run real integrations."
                confirmText="Publish and activate"
                confirmVariant="primary"
                isLoading={publishWorkflowMutation.isPending}
            />

            <ConfirmModal
                isOpen={Boolean(pendingDeletionPlan)}
                onClose={closeDeletionReview}
                onConfirm={pendingDeletionPlan?.canApply ? confirmDeletionReview : closeDeletionReview}
                title={pendingDeletionPlan?.mode === 'recovery'
                    ? (pendingDeletionPlan?.impact?.removedFields?.length > 0 ? 'Repair missing form fields?' : 'Repair broken references?')
                    : 'Review step deletion'}
                message={pendingDeletionPlan?.mode === 'recovery'
                    ? (pendingDeletionPlan?.impact?.removedFields?.length > 0
                        ? 'This draft still uses form fields that no longer exist. Clear those values before saving the draft again.'
                        : 'This draft contains values that still point to a step that no longer exists. Clear those values before saving the draft again.')
                    : `Deleting ${pendingDeletionPlan?.impact?.removedNodes?.[0]?.title || 'this step'} will update the workflow and may clear values used by later steps.`}
                confirmText={pendingDeletionPlan?.canApply
                    ? (pendingDeletionPlan?.mode === 'recovery' ? 'Clear and repair' : 'Delete and clear')
                    : 'Close'}
                confirmVariant={pendingDeletionPlan?.canApply
                    ? (pendingDeletionPlan?.mode === 'recovery' ? 'primary' : 'dangerSolid')
                    : 'soft'}
            >
                <div className="space-y-3 text-xs text-slate-600">
                    {pendingDeletionPlan?.impact?.removedFields?.length > 0 && (
                        <div>
                            <p className="font-bold text-slate-800">Missing form fields</p>
                            <ul className="mt-2 space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-2">
                                {pendingDeletionPlan.impact.removedFields.map(field => (
                                    <li key={field.id} className="flex items-center justify-between gap-3">
                                        <span className="font-semibold text-slate-700">{field.label || field.id}</span>
                                        <code className="text-[10px] text-amber-800">{field.id}</code>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                    {pendingDeletionPlan?.impact?.clearedReferences?.length > 0 && (
                        <div>
                            <p className="font-bold text-slate-800">Values that need review</p>
                            <ul className="mt-2 max-h-36 space-y-1 overflow-y-auto rounded-lg border border-amber-200 bg-amber-50 p-2">
                                {pendingDeletionPlan.impact.clearedReferences.map((item, index) => (
                                    <li key={`${item.nodeId}-${item.configPath}-${index}`} className="flex items-start justify-between gap-3">
                                        <span className="font-semibold text-slate-700">{item.title || item.nodeId}</span>
                                        <code className="text-[10px] text-amber-800">{item.configPath.replace(/^nodes\.[^.]+\.config\./, '')}</code>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                    {pendingDeletionPlan?.impact?.bypassedEdges?.length > 0 && (
                        <p className="rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 text-indigo-800">
                            The surrounding connection is simple enough to bypass automatically.
                        </p>
                    )}
                    {pendingDeletionPlan?.impact?.blockedReferences?.length > 0 && (
                        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-800">
                            Some references are ambiguous or malformed and must be repaired manually first.
                        </p>
                    )}
                </div>
            </ConfirmModal>

            {/* Execution results panel */}
            <ExecutionPanel
                isOpen={isExecutionPanelOpen}
                onClose={() => setIsExecutionPanelOpen(false)}
                log={lastExecutionLog}
                isLoading={runWorkflowMutation.isPending}
                runType={lastExecutionRunType}
            />
        </div>
    );
};

export default WorkflowBuilderView;
