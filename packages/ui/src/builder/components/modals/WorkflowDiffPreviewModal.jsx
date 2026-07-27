import { useMemo, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { ReactFlow, ReactFlowProvider, Background, Controls, MiniMap } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import DynamicNode from '../../../nodes/DynamicNode';
import DeletableEdge from '../canvas/edges/DeletableEdge';
import Button from '../../../components/ui/Button.jsx';
import { getIconByName, resolveNodeUi } from '../../utils/iconMap.jsx';
import { WORKFLOW_MODAL_LAYERS } from '../../modalLayers.js';

const nodeTypes = {
    trigger: DynamicNode,
    ai: DynamicNode,
    action: DynamicNode,
    logic: DynamicNode,
};

const edgeTypes = {
    deletable: DeletableEdge,
};

export default function WorkflowDiffPreviewModal({ isOpen, onClose, currentWorkflow, versionWorkflow, onRestore, isRestoring = false, isRestoringSuccess = false, confirmText = "Restore This Version", loadingText = "Restoring…", title = null, description = null }) {
    // Prevent background scrolling when open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => {
            document.body.style.overflow = '';
        };
    }, [isOpen]);

    const overlayRef = useRef(null);
    const modalRef = useRef(null);

    useGSAP(() => {
        if (isOpen && overlayRef.current && modalRef.current) {
            // Animate overlay fading in
            gsap.fromTo(overlayRef.current,
                { opacity: 0 },
                { opacity: 1, duration: 0.3, ease: 'power2.out' }
            );

            // Animate modal sliding up and scaling slightly
            gsap.fromTo(modalRef.current,
                { opacity: 0, y: 30, scale: 0.95 },
                { opacity: 1, y: 0, scale: 1, duration: 0.4, ease: 'back.out(1.2)', delay: 0.05 }
            );
        }
    }, { dependencies: [isOpen] });

    const handleClose = useCallback(() => {
        if (overlayRef.current && modalRef.current) {
            gsap.to(overlayRef.current, { opacity: 0, duration: 0.2, ease: 'power2.in' });
            gsap.to(modalRef.current, {
                opacity: 0,
                y: 20,
                scale: 0.95,
                duration: 0.2,
                ease: 'power2.in',
                onComplete: onClose
            });
        } else {
            onClose();
        }
    }, [onClose]);

    const handleRestore = useCallback(() => {
        onRestore(); // Fire immediately to show spinner
    }, [onRestore]);

    // Handle exit animation on success
    useEffect(() => {
        if (isRestoringSuccess && overlayRef.current && modalRef.current) {
            gsap.to(overlayRef.current, { opacity: 0, duration: 0.25, ease: 'power2.in' });
            gsap.to(modalRef.current, {
                scale: 0.95,
                y: 20,
                opacity: 0,
                duration: 0.25,
                ease: 'power2.in',
                onComplete: () => {
                    onClose();
                }
            });
        }
    }, [isRestoringSuccess, onClose]);

    const diffNodes = useMemo(() => {
        if (!currentWorkflow || !versionWorkflow) return [];
        const currentNodes = currentWorkflow.nodes || [];
        const versionNodes = versionWorkflow.nodes || [];

        const list = [];

        // 1. Added or Modified
        for (const vNode of versionNodes) {
            const cNode = currentNodes.find(n => n.id === vNode.id);
            if (!cNode) {
                list.push({ ...vNode, _diffStatus: 'added' });
            } else {
                const isModified = JSON.stringify(vNode) !== JSON.stringify(cNode);
                list.push({ ...vNode, _diffStatus: isModified ? 'updated' : 'unchanged' });
            }
        }

        // 2. Removed (exists in current but not in version)
        for (const cNode of currentNodes) {
            const vNode = versionNodes.find(n => n.id === cNode.id);
            if (!vNode) {
                list.push({ ...cNode, _diffStatus: 'removed' });
            }
        }

        return list;
    }, [currentWorkflow, versionWorkflow]);

    const rfNodes = useMemo(() => {
        return diffNodes.map((n, i) => ({
            id: n.id,
            type: n.type || 'ai',
            position: n.position || { x: i * 300, y: 150 },
            data: {
                ...n,
                diffStatus: n._diffStatus,
                isConnectable: false
            },
            draggable: false,
            selectable: true,
            zIndex: n._diffStatus === 'removed' ? 0 : 10
        }));
    }, [diffNodes]);

    const rfEdges = useMemo(() => {
        if (!versionWorkflow) return [];
        // Combine edges from old version and current version (to show removed edges if any, though here we just use version edges for simplicity)
        const vEdges = versionWorkflow.edges || [];
        return vEdges.map(e => ({
            ...e,
            type: 'deletable',
            animated: true,
            style: { stroke: '#94a3b8', strokeWidth: 2 }
        }));
    }, [versionWorkflow]);

    if (!isOpen || !versionWorkflow) return null;

    return createPortal(
        <div className="fixed inset-0 z-[100000] flex items-center justify-center p-4 sm:p-6" style={{ zIndex: WORKFLOW_MODAL_LAYERS.config }}>
            {/* Overlay */}
            <div
                ref={overlayRef}
                className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
                onClick={handleClose}
            ></div>

            {/* Modal Box */}
            <div ref={modalRef} className="relative bg-slate-50 w-full max-w-[90vw] h-[85vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">

                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-200 bg-white flex items-center justify-between shrink-0">
                    <div>
                        <h2 className="text-lg font-bold text-slate-800">{title || `Preview Version ${versionWorkflow.versionNumber}`}</h2>
                        <p className="text-xs text-slate-500 font-medium mt-0.5">{description || 'Review what will change if you restore this version.'}</p>
                    </div>
                    <Button
                        variant="ghost"
                        size="icon-md"
                        onClick={handleClose}
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </Button>
                </div>

                {/* Content Body (Split View) */}
                <div className="flex-1 flex overflow-hidden">

                    {/* Left Pane: Read-only Canvas */}
                    <div className="flex-1 relative bg-slate-50/50 border-r border-slate-200">
                        <ReactFlowProvider>
                            <ReactFlow
                                nodes={rfNodes}
                                edges={rfEdges}
                                nodeTypes={nodeTypes}
                                edgeTypes={edgeTypes}
                                fitView
                                fitViewOptions={{ padding: 0.2 }}
                                minZoom={0.1}
                                maxZoom={1.5}
                                nodesDraggable={false}
                                nodesConnectable={false}
                                elementsSelectable={true}
                                panOnScroll={true}
                                zoomOnScroll={true}
                                selectionOnDrag={false}
                                className="diff-preview-canvas"
                                proOptions={{ hideAttribution: true }}
                            >
                                <Background color="#cbd5e1" gap={20} size={1.5} />
                                <Controls showInteractive={false} />
                                <MiniMap
                                    nodeStrokeColor={(n) => {
                                        if (n.data.diffStatus === 'added') return '#10b981';
                                        if (n.data.diffStatus === 'updated') return '#f59e0b';
                                        if (n.data.diffStatus === 'removed') return '#ef4444';
                                        return '#cbd5e1';
                                    }}
                                    nodeColor={(n) => {
                                        if (n.data.diffStatus === 'added') return '#d1fae5';
                                        if (n.data.diffStatus === 'updated') return '#fef3c7';
                                        if (n.data.diffStatus === 'removed') return '#fee2e2';
                                        return '#f8fafc';
                                    }}
                                    maskColor="rgba(248, 250, 252, 0.7)"
                                    className="border border-slate-200 rounded-lg shadow-sm"
                                />
                            </ReactFlow>
                        </ReactFlowProvider>
                    </div>

                    {/* Right Pane: Vertical List */}
                    <div className="w-[450px] shrink-0 bg-white overflow-y-auto p-6 sm:p-8">
                        <div className="mb-8 pb-6 border-b border-slate-100 p-4 rounded-xl -mx-4 -mt-4">
                            <h1 className="text-2xl font-black text-slate-900 tracking-tight">{versionWorkflow.name || 'Untitled Workflow'}</h1>
                            <p className="text-sm text-slate-500 mt-2 font-medium">Created at {new Date(versionWorkflow.createdAt).toLocaleString()}</p>
                        </div>

                        {/* Nodes List */}
                        <div className="flex flex-col gap-6">
                            {diffNodes.map((node) => {
                                let wrapperClass = "relative p-4 -mx-4 rounded-xl border border-transparent transition-colors flex items-center gap-4";
                                let tag = null;

                                if (node._diffStatus === 'added') {
                                    wrapperClass = "relative p-4 -mx-4 rounded-xl bg-emerald-50 border-2 border-emerald-400 shadow-sm flex items-center gap-4";
                                    tag = <span className="absolute -top-3 left-4 bg-emerald-100 text-emerald-800 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border border-emerald-300">+ Added</span>;
                                } else if (node._diffStatus === 'updated') {
                                    wrapperClass = "relative p-4 -mx-4 rounded-xl bg-amber-50 border-2 border-amber-400 shadow-sm flex items-center gap-4";
                                    tag = <span className="absolute -top-3 left-4 bg-amber-100 text-amber-800 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border border-amber-300">~ Modified</span>;
                                } else if (node._diffStatus === 'removed') {
                                    wrapperClass = "relative p-4 -mx-4 rounded-xl bg-red-50 border-2 border-red-400 opacity-80 shadow-sm flex items-center gap-4";
                                    tag = <span className="absolute -top-3 left-4 bg-red-100 text-red-800 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border border-red-300">- Removed</span>;
                                }

                                const nodeUi = resolveNodeUi(node);

                                return (
                                    <div key={node.id} className={wrapperClass}>
                                        {tag}
                                        <div className={node._diffStatus === 'removed' ? 'pointer-events-none grayscale opacity-60 line-through w-full flex items-center gap-4' : 'pointer-events-none w-full flex items-center gap-4'}>
                                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 shadow-sm border border-slate-200/50 ${nodeUi.bgColor} ${nodeUi.color}`}>
                                                {getIconByName(nodeUi.icon, { size: 24, strokeWidth: 2.5 })}
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="font-bold text-slate-800 text-[15px]">{node.title || node.type}</span>
                                                <span className="text-sm text-slate-500 line-clamp-2 mt-0.5 leading-snug">{node.description || 'No description provided.'}</span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}

                            {diffNodes.length === 0 && (
                                <div className="text-center text-slate-400 py-10 font-medium">
                                    No nodes found in this version.
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end shrink-0 gap-3">
                    <Button
                        variant="soft"
                        onClick={onClose}
                    >
                        Cancel
                    </Button>
                    <Button
                        variant="primary"
                        onClick={handleRestore}
                        isLoading={isRestoring}
                        loadingText={loadingText}
                    >
                        {confirmText}
                    </Button>
                </div>
            </div>
        </div>,
        document.body
    );
}
