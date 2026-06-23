import React, { useMemo, useState, useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import WorkflowCanvas from './components/WorkflowCanvas';
import PropertyInspector from './components/PropertyInspector';
import AICopilotChat from './components/AICopilotChat';
import WorkflowOverview from './overview/WorkflowOverview';
import DashboardTab from './components/DashboardTab';
import FormsTab from './components/FormsTab';
import LogsTab from '../chat/components/LogsTab';
import { navigate, parsePath } from '../utils/router.js';

const INITIAL_WORKFLOWS = {
    'w1': {
        id: 'w1',
        name: 'Welcome Email Sequence',
        folderId: 'f1',
        status: 'Active',
        lastEdited: '2 hours ago',
        iconColor: 'text-green-600',
        iconBg: 'bg-green-100',
        nodes: [
            { id: 'w1-1', type: 'trigger', title: 'New Customer Subscription', description: 'Triggers when a payment is received in Stripe.' },
            { id: 'w1-2', type: 'ai', title: 'Draft Welcome Email', description: 'Generates a personalized onboarding message using GPT.' },
            { id: 'w1-3', type: 'action', title: 'Send Welcome Email', description: 'Sends the email via SMTP/Resend.' },
        ]
    },
    'w2': {
        id: 'w2',
        name: 'Support Ticket Automation',
        folderId: 'f1',
        status: 'Draft',
        lastEdited: '2 mins ago',
        iconColor: 'text-blue-600',
        iconBg: 'bg-blue-100',
        nodes: [
            { id: 'w2-1', type: 'trigger', title: 'Incoming Email', description: 'Triggers when a new email arrives at support@company.com' },
            { id: 'w2-2', type: 'ai', title: 'Extract Intent', description: 'Uses AI to parse the email and extract client intent and urgency.' },
            { id: 'w2-3', type: 'action', title: 'Create Jira Ticket', description: 'Creates a ticket in the engineering board if urgency is high.' },
        ]
    },
    'w3': {
        id: 'w3',
        name: 'Weekly Analytics Engine',
        folderId: 'f3',
        status: 'Active',
        lastEdited: '3 days ago',
        iconColor: 'text-orange-600',
        iconBg: 'bg-orange-100',
        nodes: [
            { id: 'w3-1', type: 'trigger', title: 'Weekly Schedule', description: 'Triggers every Friday at 5:00 PM.' },
            { id: 'w3-2', type: 'action', title: 'Fetch Database Metrics', description: 'Executes a Postgres query counting active weekly users.' },
            { id: 'w3-3', type: 'ai', title: 'Summarize Insights', description: 'AI highlights trends, anomalies, and key milestones.' },
            { id: 'w3-4', type: 'action', title: 'Slack Summary Report', description: 'Sends summary markdown blocks to #analytics-channel.' },
        ]
    }
};

const INITIAL_FOLDERS = [
    { id: 'f1', parentId: null, name: 'Client Onboarding', isExpanded: true },
    { id: 'f2', parentId: null, name: 'Internal Operations', isExpanded: true },
    { id: 'f3', parentId: 'f2', name: 'Weekly Reports', isExpanded: true }
];

const SYSTEM_NODES = {
    'Triggers': [
        { type: 'trigger', title: 'Webhook Trigger', description: 'Trigger via HTTP POST' },
        { type: 'trigger', title: 'Schedule', description: 'Run at specific times' },
        { type: 'trigger', title: 'Email Received', description: 'Trigger on new email' },
    ],
    'AI Nodes': [
        { type: 'ai', title: 'Extract Intent', description: 'Parse text using LLM' },
        { type: 'ai', title: 'Summarize', description: 'Generate a summary' },
        { type: 'ai', title: 'Generate Response', description: 'Draft a reply' },
    ],
    'Actions': [
        { type: 'action', title: 'Database Insert', description: 'Save to DB' },
        { type: 'action', title: 'Send Slack', description: 'Send a Slack message' },
        { type: 'action', title: 'Create Ticket', description: 'Create Jira ticket' },
    ]
};

const SIDEBAR_ICONS = {
    trigger: (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-orange-500 shrink-0">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
        </svg>
    ),
    ai: (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-indigo-600 shrink-0">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
        </svg>
    ),
    action: (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-emerald-500 shrink-0">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
        </svg>
    )
};

const CARD_STYLES = {
    trigger: {
        border: 'border-l-4 border-l-orange-500 hover:border-orange-200 hover:bg-orange-50/10',
        badge: 'bg-orange-500/10 text-orange-600 border-orange-500/10',
        shadow: 'hover:shadow-[0_4px_12px_rgba(249,115,22,0.08)] hover:-translate-y-0.5'
    },
    ai: {
        border: 'border-l-4 border-l-indigo-500 hover:border-indigo-200 hover:bg-indigo-50/10',
        badge: 'bg-indigo-500/10 text-indigo-600 border-indigo-500/10',
        shadow: 'hover:shadow-[0_4px_12px_rgba(99,102,241,0.08)] hover:-translate-y-0.5'
    },
    action: {
        border: 'border-l-4 border-l-emerald-500 hover:border-emerald-200 hover:bg-emerald-50/10',
        badge: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/10',
        shadow: 'hover:shadow-[0_4px_12px_rgba(16,185,129,0.08)] hover:-translate-y-0.5'
    }
};

const WorkflowBuilderView = ({ activeTab, setActiveTab, setSidebarCollapsed }) => {
    const [folders, setFolders] = useState(() => {
        const saved = localStorage.getItem('promptly_folders');
        if (saved) {
            try {
                return JSON.parse(saved);
            } catch (e) {
                console.error('Failed to parse saved folders', e);
            }
        }
        return INITIAL_FOLDERS;
    });

    useEffect(() => {
        localStorage.setItem('promptly_folders', JSON.stringify(folders));
    }, [folders]);

    const [workflows, setWorkflows] = useState(() => {
        const saved = localStorage.getItem('promptly_workflows');
        if (saved) {
            try {
                return JSON.parse(saved);
            } catch (e) {
                console.error('Failed to parse saved workflows', e);
            }
        }
        return INITIAL_WORKFLOWS;
    });

    useEffect(() => {
        localStorage.setItem('promptly_workflows', JSON.stringify(workflows));
    }, [workflows]);

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
    const handleSelectWorkflow = (wfId, name, folderName) => {
        setWorkflows(prev => {
            if (prev[wfId]) return prev;
            return {
                ...prev,
                [wfId]: {
                    id: wfId,
                    name: name || 'Untitled Workflow',
                    folderId: null,
                    status: 'Draft',
                    lastEdited: 'Just now',
                    iconColor: 'text-blue-600',
                    iconBg: 'bg-blue-100',
                    nodes: []
                }
            };
        });
        navigateToBuilder(wfId);
    };

    // Create workflow from overview header
    const handleCreateWorkflow = () => {
        const newWfId = `w${Date.now()}`;
        setWorkflows(prev => ({
            ...prev,
            [newWfId]: {
                id: newWfId,
                name: 'New Sequence Automation',
                folderId: 'f1',
                status: 'Draft',
                lastEdited: 'Just now',
                iconColor: 'text-blue-600',
                iconBg: 'bg-blue-100',
                nodes: []
            }
        }));
        navigateToBuilder(newWfId);
    };

    
    // Sidebar visibility state (left and right sidebars default to closed)
    const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(true);
    const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(true);
    
    // Right panel active tab: 'chat' | 'properties'
    const [rightTab, setRightTab] = useState('chat');
    
    // Left search state
    const [searchQuery, setSearchQuery] = useState('');
    
    // Track dragged node for canvas live preview
    const [draggedNode, setDraggedNode] = useState(null);

    const builderContainer = useRef(null);

    useGSAP(() => {
        if (viewMode === 'builder') {
            gsap.from(builderContainer.current, { opacity: 0, duration: 0.3, ease: 'power2.out' });
        }
    }, { scope: builderContainer, dependencies: [viewMode] });

    const activeWorkflow = useMemo(() => workflows[activeWorkflowId] || Object.values(workflows)[0], [workflows, activeWorkflowId]);
    const nodes = activeWorkflow.nodes;
    const activeNode = useMemo(() => nodes.find(n => n.id === activeNodeId), [nodes, activeNodeId]);

    const activeFolder = useMemo(() => {
        if (!activeWorkflow || !activeWorkflow.folderId) return null;
        return folders.find(f => f.id === activeWorkflow.folderId);
    }, [folders, activeWorkflow]);

    const activeFolderName = activeFolder ? activeFolder.name : 'Root';

    // Handle node selection
    const handleNodeClick = (nodeId) => {
        setActiveNodeId(nodeId);
        setRightTab('properties'); // Auto focus properties when user selects a node
        setIsRightSidebarOpen(true);
    };

    // Callback when Copilot AI actions are approved
    const handleApplyAction = (proposal) => {
        const newNodeId = `${activeWorkflowId}-${Date.now()}`;
        const newNode = {
            id: newNodeId,
            type: proposal.type,
            title: proposal.title,
            description: proposal.description
        };

        setWorkflows(prev => {
            const currentWf = prev[activeWorkflowId];
            return {
                ...prev,
                [activeWorkflowId]: {
                    ...currentWf,
                    nodes: [...currentWf.nodes, newNode]
                }
            };
        });

        // Set the newly created node as active and view its properties
        setActiveNodeId(newNodeId);
    };

    // Add Node from Drag-and-Drop
    const handleAddNode = (nodeData, position) => {
        const newNodeId = `${activeWorkflowId}-${Date.now()}`;
        const newNode = {
            id: newNodeId,
            type: nodeData.type,
            title: nodeData.title,
            description: nodeData.description,
            position
        };

        setWorkflows(prev => {
            const currentWf = prev[activeWorkflowId];
            return {
                ...prev,
                [activeWorkflowId]: {
                    ...currentWf,
                    nodes: [...currentWf.nodes, newNode]
                }
            };
        });
        setActiveNodeId(newNodeId);
    };

    // Update node positions when dragged in the canvas
    const handleNodesChange = (changes) => {
        const positionChanges = changes.filter(c => c.type === 'position' && c.position);
        if (positionChanges.length === 0) return;

        setWorkflows(prev => {
            const currentWf = prev[activeWorkflowId];
            const updatedNodes = currentWf.nodes.map(node => {
                const change = positionChanges.find(c => c.id === node.id);
                if (change) {
                    return { ...node, position: change.position };
                }
                return node;
            });

            return {
                ...prev,
                [activeWorkflowId]: {
                    ...currentWf,
                    nodes: updatedNodes
                }
            };
        });
    };

    // Live update of node configuration from properties panel
    const handleUpdateNode = (nodeId, updatedFields) => {
        setWorkflows(prev => {
            const currentWf = prev[activeWorkflowId];
            if (!currentWf) return prev;

            const updatedNodes = currentWf.nodes.map(node => {
                if (node.id === nodeId) {
                    const nextNode = { ...node, ...updatedFields };
                    if (updatedFields.config && node.config) {
                        nextNode.config = { ...node.config, ...updatedFields.config };
                    }
                    return nextNode;
                }
                return node;
            });

            return {
                ...prev,
                [activeWorkflowId]: {
                    ...currentWf,
                    nodes: updatedNodes
                }
            };
        });
    };

    const activeWorkflowCount = useMemo(() => {
        return Object.values(workflows).filter(w => w.status === 'Active').length;
    }, [workflows]);

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
                className={`bg-slate-50/90 backdrop-blur-md border-r border-slate-200/60 flex flex-col h-full transition-all duration-300 relative z-20 ${
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
                            className="w-full bg-white border border-slate-200 rounded-lg pl-8 pr-3 py-2 text-sm font-medium text-slate-800 placeholder:text-slate-400 outline-none focus:border-blue-400 transition-all shadow-inner"
                        />
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="absolute left-2.5 top-2.5 text-slate-400"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                    </div>
                </div>

                {/* Node List */}
                <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-4">
                    {Object.entries(SYSTEM_NODES).map(([category, items]) => {
                        const filteredItems = items.filter(item => 
                            item.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            item.description.toLowerCase().includes(searchQuery.toLowerCase())
                        );

                        if (filteredItems.length === 0 && searchQuery) return null;

                        return (
                            <div key={category} className="flex flex-col gap-2">
                                <div className="flex items-center gap-1.5 text-slate-400 px-1 select-none">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
                                    <span className="text-xs font-semibold text-slate-500">{category}</span>
                                </div>

                                <div className="flex flex-col gap-2">
                                    {filteredItems.map(node => {
                                        const isDragging = draggedNode?.title === node.title;
                                        const typeIcon = SIDEBAR_ICONS[node.type] || SIDEBAR_ICONS.ai;
                                        const nodeTheme = CARD_STYLES[node.type] || CARD_STYLES.ai;
                                        
                                        return (
                                            <div
                                                key={node.title}
                                                draggable
                                                onDragStart={(e) => {
                                                    setDraggedNode(node);
                                                    e.dataTransfer.setData('application/reactflow-type', node.type);
                                                    e.dataTransfer.setData('application/reactflow-data', JSON.stringify(node));
                                                    e.dataTransfer.effectAllowed = 'copy';
                                                    
                                                    // Hide the default browser drag ghost
                                                    const img = new Image();
                                                    img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
                                                    e.dataTransfer.setDragImage(img, 0, 0);
                                                }}
                                                onDragEnd={() => setDraggedNode(null)}
                                                className={`bg-white border-t border-r border-b border-slate-200 p-3 rounded-r-xl cursor-grab active:cursor-grabbing transition-all duration-300 flex flex-col gap-1.5 ${nodeTheme.border} ${nodeTheme.shadow} ${
                                                    isDragging 
                                                        ? 'opacity-30 border-dashed border-slate-300' 
                                                        : ''
                                                }`}
                                            >
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="text-sm font-medium text-slate-800 truncate">{node.title}</span>
                                                    <div className="flex items-center gap-1.5 shrink-0">
                                                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border select-none ${nodeTheme.badge}`}>
                                                            {node.type}
                                                        </span>
                                                        {typeIcon}
                                                    </div>
                                                </div>
                                                <p className="text-xs font-medium text-slate-500 leading-snug line-clamp-1">{node.description}</p>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
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
                                    ? 'border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100'
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
                            <h2 className="text-base font-semibold text-slate-900 truncate">{activeWorkflow.name}</h2>
                            <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded ml-2 ${
                                activeWorkflow.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
                            }`}>
                                {activeWorkflow.status}
                            </span>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                        <button className="ghost text-sm py-1.5 px-3.5 rounded-lg font-medium border-slate-200 shadow-sm hover:shadow whitespace-nowrap">Test Run</button>
                        <button className="solid text-sm py-1.5 px-4 rounded-lg shadow bg-blue-600 text-white font-medium hover:bg-blue-700 whitespace-nowrap">Deploy</button>
                        
                        {/* Copilot toggle button */}
                        <button
                            onClick={() => setIsRightSidebarOpen(!isRightSidebarOpen)}
                            className={`shrink-0 p-1.5 rounded-lg border transition-colors ${
                                isRightSidebarOpen 
                                    ? 'border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100'
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
                    <span>Last edit: {activeWorkflow.lastEdited}</span>
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
                className={`bg-white/90 backdrop-blur-md border-l border-slate-200/60 flex flex-col h-full transition-all duration-300 relative z-20 shadow-xl ${
                    isRightSidebarOpen ? 'w-[340px]' : 'w-0 opacity-0 overflow-hidden border-none'
                }`}
            >
                {/* Tab select bar */}
                <div className="flex border-b border-slate-200/60 shrink-0">
                    <button
                        onClick={() => setRightTab('chat')}
                        className={`flex-1 py-3 px-1 text-center text-sm truncate font-medium transition-all border-b-2 ${
                            rightTab === 'chat'
                                ? 'border-blue-600 text-blue-600 bg-blue-50/30'
                                : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                        }`}
                    >
                        Promptly Agent
                    </button>
                    <button
                        onClick={() => setRightTab('properties')}
                        className={`flex-1 py-3 px-1 text-center text-sm truncate font-medium transition-all border-b-2 ${
                            rightTab === 'properties'
                                ? 'border-blue-600 text-blue-600 bg-blue-50/30'
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
                        <AICopilotChat onApplyAction={handleApplyAction} />
                    ) : (
                        <PropertyInspector activeNode={activeNode} onUpdateNode={handleUpdateNode} />
                    )}
                </div>
            </aside>
            
        </div>
    );
};

export default WorkflowBuilderView;
