import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import WorkflowCanvas from './components/WorkflowCanvas';
import PropertyInspector from './components/PropertyInspector';
import AIAgentChat from './components/AIAgentChat';
import WorkflowOverview from './overview/WorkflowOverview';
import DashboardTab from './components/DashboardTab';
import FormsTab from './components/FormsTab';
import LogsTab from '../chat/components/LogsTab';
import { navigate, parsePath } from '../utils/router.js';
import { useWorkflows, useCreateWorkflow, useUpdateWorkflow } from '../api/hooks/useWorkflows.js';
import { useFolders } from '../api/hooks/useFolders.js';
import { formatLastEdited } from './utils/timeUtils.js';

import { useQuery } from '@tanstack/react-query';

import { ICON_MAP } from './utils/iconMap.jsx';

const WorkflowBuilderView = ({ activeTab, setActiveTab, setSidebarCollapsed }) => {
    const { data: folders = [], isLoading: isFoldersLoading } = useFolders();
    const { data: workflowsData = [], isLoading: isWorkflowsLoading } = useWorkflows();
    const createWorkflowMutation = useCreateWorkflow();
    const updateWorkflowMutation = useUpdateWorkflow();
    const queryClient = useQueryClient();

    const { data: nodeLibrary = [], isLoading: isNodeLibraryLoading } = useQuery({
        queryKey: ['nodeLibrary'],
        queryFn: async () => {
            const response = await fetch('/api/nodes/library');
            if (!response.ok) throw new Error('Network response was not ok');
            return response.json();
        }
    });

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

    const workflows = useMemo(() => {
        const map = {};
        workflowsData.forEach(w => { map[w.id] = w; });
        return map;
    }, [workflowsData]);

    // Force re-render every minute so the relative time updates in real-time
    const [currentTime, setCurrentTime] = useState(() => Date.now());
    
    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(Date.now()), 60000);
        return () => clearInterval(timer);
    }, []);

    // ── URL-driven view mode ─────────────────────────────────────────────────
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

    // Keep viewMode/workflowId in sync when the user hits back/forward
    useEffect(() => {
        const handler = () => {
            const { viewMode: vm, workflowId: wid } = getViewStateFromUrl();
            setViewModeState(vm);
            setActiveWorkflowId(wid);
        };
        window.addEventListener('popstate', handler);
        return () => window.removeEventListener('popstate', handler);
    }, []);

    // Navigate to builder view for a given workflow id
    const navigateToBuilder = (wfId) => {
        navigate(`/workflow/builder/${wfId}`);
        setViewModeState('builder');
        setActiveWorkflowId(wfId);
        if (setSidebarCollapsed) setSidebarCollapsed(true);
    };

    // Navigate to overview
    const navigateToOverview = () => {
        navigate('/workflow/workflows');
        setViewModeState('overview');
    };

    // Alias used by the rest of the component for backward compat
    const setViewMode = (mode) => {
        if (mode === 'overview') navigateToOverview();
        // 'builder' is handled via navigateToBuilder
    };

    // Select workflow from overview folder tree
    const handleSelectWorkflow = (wfId) => {
        navigateToBuilder(wfId);
    };

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
            onSuccess: (newWorkflow) => {
                navigateToBuilder(newWorkflow.id);
            },
            onSettled: () => {
                if (e?.detail?.onComplete) e.detail.onComplete();
            }
        });
    };

    useEffect(() => {
        window.addEventListener('create-workflow', handleCreateWorkflow);
        return () => window.removeEventListener('create-workflow', handleCreateWorkflow);
    }, [folders]);

    
    // Sidebar visibility state (left and right sidebars default to closed)
    const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(true);
    const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(true);
    
    // Right panel active tab: 'chat' | 'properties'
    const [rightTab, setRightTab] = useState('chat');
    
    // Left search state
    const [searchQuery, setSearchQuery] = useState('');
    
    // Track dragged node for canvas live preview
    const [draggedNode, setDraggedNode] = useState(null);

    // Title inline editing
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [titleInput, setTitleInput] = useState('');

    const builderContainer = useRef(null);

    useGSAP(() => {
        if (viewMode === 'builder') {
            gsap.from(builderContainer.current, { opacity: 0, duration: 0.3, ease: 'power2.out' });
        }
    }, { scope: builderContainer, dependencies: [viewMode] });

    const activeWorkflow = useMemo(() => workflows[activeWorkflowId] || Object.values(workflows)[0] || null, [workflows, activeWorkflowId]);
    const nodes = activeWorkflow?.nodes || [];
    const activeNode = useMemo(() => nodes.find(n => n.id === activeNodeId) || null, [nodes, activeNodeId]);

    const activeFolder = useMemo(() => {
        if (!activeWorkflow || !activeWorkflow.folderId) return null;
        return folders.find(f => f.id === activeWorkflow.folderId);
    }, [folders, activeWorkflow]);

    const activeFolderName = activeFolder ? activeFolder.name : 'Root';

    const handleWorkflowUpdate = (updatedFields) => {
        if (!activeWorkflowId) return;
        updateWorkflowMutation.mutate({
            id: activeWorkflowId,
            data: updatedFields
        });
    };

    const handleTitleEditStart = () => {
        setTitleInput(activeWorkflow?.name || 'Untitled');
        setIsEditingTitle(true);
    };

    const handleTitleEditComplete = () => {
        if (titleInput.trim() && titleInput !== activeWorkflow?.name) {
            handleWorkflowUpdate({ name: titleInput.trim() });
        }
        setIsEditingTitle(false);
    };

    // Handle node selection
    const handleNodeClick = (nodeId) => {
        setActiveNodeId(nodeId);
        setRightTab('properties'); // Auto focus properties when user selects a node
        setIsRightSidebarOpen(true);
    };

    // Callback when Agent AI actions are approved
    const handleApplyAction = (proposal) => {
        const newNodeId = `${activeWorkflowId}-${Date.now()}`;
        const newNode = {
            id: newNodeId,
            type: proposal.type,
            subType: proposal.subType,
            title: proposal.title,
            description: proposal.description
        };

            const updatedNodes = [...nodes, newNode];
        handleWorkflowUpdate({ nodes: updatedNodes });
        setActiveNodeId(newNodeId);
    };

    // Add Node from Drag-and-Drop
    const handleAddNode = (nodeData, position) => {
        const newNodeId = `${activeWorkflowId}-${Date.now()}`;
        const newNode = {
            id: newNodeId,
            type: nodeData.type,
            subType: nodeData.subType,
            title: nodeData.title,
            description: nodeData.description,
            position
        };

        const updatedNodes = [...nodes, newNode];
        handleWorkflowUpdate({ nodes: updatedNodes });
        setActiveNodeId(newNodeId);
    };

    // Update node positions and handle deletions when changed in the canvas
    const handleNodesChange = (changes) => {
        const positionChanges = changes.filter(c => c.type === 'position' && c.position && !c.dragging);
        const removeChanges = changes.filter(c => c.type === 'remove');

        if (positionChanges.length === 0 && removeChanges.length === 0) return;

        let updatedNodes = [...nodes];
        let hasChanges = false;

        if (positionChanges.length > 0) {
            updatedNodes = updatedNodes.map(node => {
                const change = positionChanges.find(c => c.id === node.id);
                if (change) {
                    return { ...node, position: change.position };
                }
                return node;
            });
            hasChanges = true;
        }

        if (removeChanges.length > 0) {
            const removeIds = removeChanges.map(c => c.id);
            updatedNodes = updatedNodes.filter(node => !removeIds.includes(node.id));
            hasChanges = true;
            
            // If active node is deleted, clear selection
            if (removeIds.includes(activeNodeId)) {
                setActiveNodeId(null);
                setIsRightSidebarOpen(false);
            }
        }

        if (hasChanges) {
            handleWorkflowUpdate({ nodes: updatedNodes });
        }
    };

    // Live update of node configuration from properties panel
    const handleUpdateNode = (nodeId, updatedFields) => {
        const updatedNodes = nodes.map(node => {
            if (node.id === nodeId) {
                const nextNode = { ...node, ...updatedFields };
                if (updatedFields.config && node.config) {
                    nextNode.config = { ...node.config, ...updatedFields.config };
                }
                return nextNode;
            }
            return node;
        });

        handleWorkflowUpdate({ nodes: updatedNodes });
    };

    const activeWorkflowCount = useMemo(() => {
        return Object.values(workflows).filter(w => w.status === 'Active').length;
    }, [workflows]);

    if (loading) {
        return (
            <div className="flex-1 flex w-full h-full bg-slate-50 overflow-hidden font-sans">
                {/* Skeleton Sidebar */}
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

                {/* Skeleton Main Area */}
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
                        {/* Background pattern */}
                        <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(#94a3b8 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>
                        {/* Skeleton Nodes */}
                        <div className="absolute top-32 left-1/4 w-64 h-32 bg-white border border-slate-200 rounded-xl shadow-sm animate-pulse"></div>
                        <div className="absolute top-64 left-1/2 w-64 h-32 bg-white border border-slate-200 rounded-xl shadow-sm animate-pulse"></div>
                    </div>
                </main>
            </div>
        );
    }

    // Sidebar tab-based routing
    if (activeTab === 'dashboard') {
        return <DashboardTab activeWorkflowCount={activeWorkflowCount} onNavigateTab={setActiveTab} />;
    }

    if (activeTab === 'forms') {
        return <FormsTab />;
    }

    if (activeTab === 'logs') {
        return <LogsTab />;
    }

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

    return (
        <div ref={builderContainer} className="flex-1 flex w-full h-full bg-slate-50 overflow-hidden font-sans">
            
            {/* 1. LEFT SIDEBAR: Node Library */}
            <aside 
                className={`bg-slate-50/90 backdrop-blur-md border-r border-slate-200/60 flex flex-col h-full transition-all duration-300 relative z-20 shrink-0 ${
                    isLeftSidebarOpen ? 'w-72' : 'w-0 opacity-0 overflow-hidden border-none'
                }`}
            >
                {/* Search / Action */}
                <div className="p-4 border-b border-slate-200 flex flex-col gap-2 shrink-0">
                    <h3 className="font-semibold text-slate-900 text-sm">Node Library</h3>
                    <div className="relative">
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Find nodes..."
                            className="w-full bg-white border border-slate-200 rounded-lg pl-8 pr-3 py-2 text-sm font-medium text-slate-800 placeholder:text-slate-400 outline-none focus:border-indigo-400 transition-all shadow-inner"
                        />
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="absolute left-2.5 top-2.5 text-slate-400"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                    </div>
                </div>

                {/* Node List */}
                <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-5">
                    {isNodeLibraryLoading ? (
                        <div className="flex items-center justify-center h-full">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
                        </div>
                    ) : (
                        nodeLibrary.map((section) => {
                            // Filter groups and items based on search
                            const filteredGroups = section.groups.map(group => {
                                const filteredItems = group.items.filter(item => 
                                    item.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                                    item.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                    group.name.toLowerCase().includes(searchQuery.toLowerCase())
                                );
                                return { ...group, items: filteredItems };
                            }).filter(group => group.items.length > 0);

                            if (filteredGroups.length === 0 && searchQuery) return null;

                            return (
                                <div key={section.category} className="flex flex-col gap-3">
                                    {/* Category Header */}
                                    <div className="flex items-center gap-1.5 text-slate-400 px-1 select-none border-b border-slate-200/50 pb-1.5">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
                                        <span className="text-sm font-bold text-slate-700 tracking-tight">{section.category}</span>
                                    </div>

                                    {/* Groups */}
                                    <div className="flex flex-col gap-4">
                                        {filteredGroups.map(group => (
                                            <div key={group.name} className="flex flex-col gap-2">
                                                {/* Sub-group Header */}
                                                <div className="px-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider select-none">
                                                    {group.name}
                                                </div>

                                                {/* Nodes */}
                                                <div className="flex flex-col gap-2">
                                                    {group.items.map(node => {
                                                        const isDragging = draggedNode?.title === node.title;
                                                        
                                                        // Fallback UI if not defined
                                                        const color = node.color || 'text-slate-500';
                                                        const bgColor = node.bgColor || 'bg-slate-100';
                                                        const borderColor = node.borderColor || 'border-slate-300';
                                                        const shadow = node.shadow || 'hover:shadow-slate-200';
                                                        const IconComponent = ICON_MAP[node.icon] || ICON_MAP.default;

                                                        return (
                                                            <div
                                                                key={node.title}
                                                                draggable
                                                                onDragStart={(e) => {
                                                                    setDraggedNode(node);
                                                                    e.dataTransfer.setData('application/reactflow-type', node.type);
                                                                    e.dataTransfer.setData('application/reactflow-data', JSON.stringify(node));
                                                                    e.dataTransfer.effectAllowed = 'copy';
                                                                    
                                                                    const img = new Image();
                                                                    img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
                                                                    e.dataTransfer.setDragImage(img, 0, 0);
                                                                }}
                                                                onDragEnd={() => setDraggedNode(null)}
                                                                className={`group bg-white p-3 rounded-xl cursor-grab active:cursor-grabbing transition-all duration-300 flex items-start gap-3 border border-slate-200 hover:shadow-md hover:-translate-y-0.5 hover:border-${color.replace('text-', '').replace('500', '300')} ${
                                                                    isDragging ? 'opacity-30 border-dashed border-slate-300' : ''
                                                                }`}
                                                            >
                                                                {/* Icon Container */}
                                                                <div className={`mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${bgColor} ${color} border border-${color.replace('text-', '').replace('500', '100')} group-hover:scale-105 transition-transform`}>
                                                                    {IconComponent}
                                                                </div>
                                                                
                                                                {/* Content */}
                                                                <div className="flex flex-col flex-1 min-w-0">
                                                                    <div className="flex items-center justify-between gap-2 mb-1">
                                                                        <span className="text-[13px] font-bold text-slate-800 truncate group-hover:text-slate-900 transition-colors">{node.title}</span>
                                                                        <span className={`text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded bg-slate-50 text-slate-400 border border-slate-200 select-none`}>
                                                                            {node.type}
                                                                        </span>
                                                                    </div>
                                                                    <p className="text-[11px] font-medium text-slate-500 leading-snug line-clamp-2">{node.description}</p>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </aside>

            {/* 2. CENTER PANEL: Main Interactive Canvas */}
            <main className="flex-1 flex flex-col h-full bg-slate-50/50 relative overflow-hidden">
                
                {/* Header toolbar */}
                <div className="w-full h-14 bg-white/80 backdrop-blur-md border-b border-slate-200/60 flex items-center justify-between px-4 z-10 shrink-0 shadow-sm gap-4">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                        {/* Sidebar toggle buttons */}
                        <button
                            onClick={() => setIsLeftSidebarOpen(!isLeftSidebarOpen)}
                            className={`shrink-0 p-1.5 rounded-lg border transition-colors ${
                                isLeftSidebarOpen 
                                    ? 'border-indigo-200 bg-indigo-50 text-indigo-600 hover:bg-indigo-100'
                                    : 'border-slate-200 text-slate-500 hover:bg-slate-100' 
                            }`}
                            title="Toggle Node Library"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line></svg>
                        </button>

                        {/* Back to Workspace Overview */}
                        <button
                            onClick={() => {
                                setViewMode('overview');
                                if (setSidebarCollapsed) {
                                    setSidebarCollapsed(false);
                                }
                            }}
                            className="shrink-0 p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 transition-colors"
                            title="Back to Workspace Overview"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <line x1="19" y1="12" x2="5" y2="12"></line>
                                <polyline points="12 19 5 12 12 5"></polyline>
                            </svg>
                        </button>

                        <div className="flex items-center gap-1.5 flex-1 min-w-0">
                            <span className="text-slate-500 text-sm font-medium truncate hidden sm:block">{activeFolderName}</span>
                            <span className="text-slate-300 text-sm hidden sm:block">/</span>
                            
                            {isEditingTitle ? (
                                <input
                                    autoFocus
                                    className="text-base font-semibold text-slate-900 bg-white border border-indigo-300 rounded px-1.5 py-0.5 outline-none focus:ring-2 focus:ring-indigo-500/20 w-48"
                                    value={titleInput}
                                    onChange={(e) => setTitleInput(e.target.value)}
                                    onBlur={handleTitleEditComplete}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleTitleEditComplete();
                                        if (e.key === 'Escape') setIsEditingTitle(false);
                                    }}
                                />
                            ) : (
                                <div 
                                    className="flex items-center gap-1.5 group cursor-pointer hover:bg-slate-100 rounded px-1.5 py-0.5 transition-colors"
                                    onClick={handleTitleEditStart}
                                    title="Click to edit name"
                                >
                                    <h2 className="text-base font-semibold text-slate-900 truncate">
                                        {activeWorkflow?.name || 'Untitled'}
                                    </h2>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
                                </div>
                            )}
                            <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded ml-2 ${
                                activeWorkflow?.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
                            }`}>
                                {activeWorkflow?.status || 'Draft'}
                            </span>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                        <button className="ghost text-sm py-1.5 px-3.5 rounded-lg font-medium border-slate-200 shadow-sm hover:shadow whitespace-nowrap">Test Run</button>
                        <button className="solid text-sm py-1.5 px-4 rounded-lg shadow bg-indigo-600 text-white font-medium hover:bg-indigo-700 whitespace-nowrap">Deploy</button>
                        
                        {/* Agent toggle button */}
                        <button
                            onClick={() => setIsRightSidebarOpen(!isRightSidebarOpen)}
                            className={`shrink-0 p-1.5 rounded-lg border transition-colors ${
                                isRightSidebarOpen 
                                    ? 'border-indigo-200 bg-indigo-50 text-indigo-600 hover:bg-indigo-100'
                                    : 'border-slate-200 text-slate-500 hover:bg-slate-100' 
                            }`}
                            title="Toggle Promptly Agent / Inspector"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="15" y1="3" x2="15" y2="21"></line></svg>
                        </button>
                    </div>
                </div>

                {/* Breadcrumbs / Last edited subheader */}
                <div className="px-6 py-2 bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-500 flex items-center justify-between shrink-0">
                    <span>Active nodes: {nodes.length}</span>
                    <span>Last edit: {formatLastEdited(activeWorkflow?.updatedAt || activeWorkflow?.createdAt, currentTime)}</span>
                </div>

                {/* Workflow Canvas Workspace */}
                <div className="flex-1 p-6 overflow-hidden flex flex-col bg-slate-50">
                    <WorkflowCanvas
                        initialNodes={nodes}
                        activeNodeId={activeNodeId}
                        onNodeClick={handleNodeClick}
                        onAddNode={handleAddNode}
                        onNodesChangeCallback={handleNodesChange}
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
                {/* Tab select bar */}
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
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>

                {/* Tab Contents */}
                <div className="flex-1 overflow-hidden">
                    {rightTab === 'chat' ? (
                        <AIAgentChat onApplyAction={handleApplyAction} />
                    ) : (
                        <PropertyInspector activeNode={activeNode} onUpdateNode={handleUpdateNode} />
                    )}
                </div>
            </aside>
            
        </div>
    );
};

export default WorkflowBuilderView;
