import React, { useMemo, useState } from 'react';
import WorkflowCanvas from './components/WorkflowCanvas';
import PropertyInspector from './components/PropertyInspector';
import AICopilotChat from './components/AICopilotChat';

const INITIAL_WORKFLOWS = {
    'w1': {
        id: 'w1',
        name: 'Welcome Email Sequence',
        folder: 'Client Onboarding',
        status: 'Active',
        lastEdited: '2 hours ago',
        nodes: [
            { id: 'w1-1', type: 'trigger', title: 'New Customer Subscription', description: 'Triggers when a payment is received in Stripe.' },
            { id: 'w1-2', type: 'ai', title: 'Draft Welcome Email', description: 'Generates a personalized onboarding message using GPT.' },
            { id: 'w1-3', type: 'action', title: 'Send Welcome Email', description: 'Sends the email via SMTP/Resend.' },
        ]
    },
    'w2': {
        id: 'w2',
        name: 'Support Ticket Automation',
        folder: 'Client Onboarding',
        status: 'Draft',
        lastEdited: '2 mins ago',
        nodes: [
            { id: 'w2-1', type: 'trigger', title: 'Incoming Email', description: 'Triggers when a new email arrives at support@company.com' },
            { id: 'w2-2', type: 'ai', title: 'Extract Intent', description: 'Uses AI to parse the email and extract client intent and urgency.' },
            { id: 'w2-3', type: 'action', title: 'Create Jira Ticket', description: 'Creates a ticket in the engineering board if urgency is high.' },
        ]
    },
    'w3': {
        id: 'w3',
        name: 'Weekly Analytics Engine',
        folder: 'Internal Operations',
        status: 'Active',
        lastEdited: '3 days ago',
        nodes: [
            { id: 'w3-1', type: 'trigger', title: 'Weekly Schedule', description: 'Triggers every Friday at 5:00 PM.' },
            { id: 'w3-2', type: 'action', title: 'Fetch Database Metrics', description: 'Executes a Postgres query counting active weekly users.' },
            { id: 'w3-3', type: 'ai', title: 'Summarize Insights', description: 'AI highlights trends, anomalies, and key milestones.' },
            { id: 'w3-4', type: 'action', title: 'Slack Summary Report', description: 'Sends summary markdown blocks to #analytics-channel.' },
        ]
    }
};

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

const WorkflowBuilderView = () => {
    const [workflows, setWorkflows] = useState(INITIAL_WORKFLOWS);
    const [activeWorkflowId, setActiveWorkflowId] = useState('w2');
    const [activeNodeId, setActiveNodeId] = useState('w2-2');
    
    // Sidebar visibility state (left and right sidebars default to closed)
    const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(true);
    const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(true);
    
    // Right panel active tab: 'chat' | 'properties'
    const [rightTab, setRightTab] = useState('chat');
    
    // Left search state
    const [searchQuery, setSearchQuery] = useState('');
    
    // Track dragged node for canvas live preview
    const [draggedNode, setDraggedNode] = useState(null);

    const activeWorkflow = useMemo(() => workflows[activeWorkflowId] || Object.values(workflows)[0], [workflows, activeWorkflowId]);
    const nodes = activeWorkflow.nodes;
    const activeNode = useMemo(() => nodes.find(n => n.id === activeNodeId), [nodes, activeNodeId]);

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

    return (
        <div className="flex-1 flex w-full h-full bg-slate-50 overflow-hidden font-sans">
            
            {/* 1. LEFT SIDEBAR: Node Library */}
            <aside 
                className={`bg-slate-50/90 backdrop-blur-md border-r border-slate-200/60 flex flex-col h-full transition-all duration-300 relative z-20 ${
                    isLeftSidebarOpen ? 'w-72' : 'w-0 opacity-0 overflow-hidden border-none'
                }`}
            >
                {/* Search / Action */}
                <div className="p-4 border-b border-slate-200 flex flex-col gap-2 shrink-0">
                    <h3 className="font-extrabold text-slate-800 text-xs uppercase tracking-wider">Node Library</h3>
                    <div className="relative">
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Find nodes..."
                            className="w-full bg-white border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 text-xs font-semibold text-slate-800 placeholder:text-slate-400 outline-none focus:border-blue-400 transition-all shadow-inner"
                        />
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="absolute left-2.5 top-2.5 text-slate-400"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
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
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
                                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{category}</span>
                                </div>

                                <div className="flex flex-col gap-1.5">
                                    {filteredItems.map(node => (
                                        <div
                                            key={node.title}
                                            draggable
                                            onDragStart={(e) => {
                                                setDraggedNode(node);
                                                e.dataTransfer.setData('application/reactflow-type', node.type);
                                                e.dataTransfer.setData('application/reactflow-data', JSON.stringify(node));
                                                e.dataTransfer.effectAllowed = 'copy';
                                            }}
                                            onDragEnd={() => setDraggedNode(null)}
                                            className="bg-white border border-slate-200 p-2.5 rounded-lg shadow-sm cursor-grab active:cursor-grabbing hover:border-blue-300 hover:shadow transition-all group"
                                        >
                                            <div className="flex items-center gap-2">
                                                <span className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded shrink-0 ${
                                                    node.type === 'trigger' ? 'bg-indigo-100 text-indigo-700' :
                                                    node.type === 'ai' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                                                }`}>
                                                    {node.type}
                                                </span>
                                                <span className="text-xs font-bold text-slate-800 truncate">{node.title}</span>
                                            </div>
                                            <p className="text-[10px] text-slate-500 mt-1 truncate">{node.description}</p>
                                        </div>
                                    ))}
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

                        <div className="flex items-center gap-1.5 flex-1 min-w-0">
                            <span className="text-slate-400 text-xs font-bold truncate hidden sm:block">{activeWorkflow.folder}</span>
                            <span className="text-slate-300 text-xs hidden sm:block">/</span>
                            <h2 className="text-sm font-extrabold text-slate-800 truncate">{activeWorkflow.name}</h2>
                            <span className={`shrink-0 text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded ml-2 ${
                                activeWorkflow.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
                            }`}>
                                {activeWorkflow.status}
                            </span>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                        <button className="ghost text-xs py-1.5 px-3 rounded-lg font-bold border-slate-200 shadow-sm hover:shadow whitespace-nowrap">Test Run</button>
                        <button className="solid text-xs py-1.5 px-4 rounded-lg shadow bg-blue-600 text-white font-bold hover:bg-blue-700 whitespace-nowrap">Deploy</button>
                        
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
                <div className="px-6 py-2 bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-400 flex items-center justify-between shrink-0">
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
                        className={`flex-1 py-3 px-1 text-center text-[10px] truncate font-extrabold uppercase tracking-wider transition-all border-b-2 ${
                            rightTab === 'chat'
                                ? 'border-blue-600 text-blue-600 bg-blue-50/30'
                                : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                        }`}
                    >
                        Promptly Agent
                    </button>
                    <button
                        onClick={() => setRightTab('properties')}
                        className={`flex-1 py-3 px-1 text-center text-[10px] truncate font-extrabold uppercase tracking-wider transition-all border-b-2 ${
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
                        <PropertyInspector activeNode={activeNode} />
                    )}
                </div>
            </aside>
            
        </div>
    );
};

export default WorkflowBuilderView;
