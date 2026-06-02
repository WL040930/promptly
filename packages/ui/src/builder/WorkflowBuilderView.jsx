import React, { useMemo, useState } from 'react';
import AICommandBar from './builder/AICommandBar';
import MetricsBar from './builder/MetricsBar';
import WorkflowCanvas from './builder/WorkflowCanvas';
import PropertyInspector from './builder/PropertyInspector';
import ProfessionalOverview from './overview/ProfessionalOverview';

// Mock initial nodes for the builder
const INITIAL_NODES = [
    { id: '1', type: 'trigger', title: 'Incoming Email', description: 'Triggers when a new email arrives at support@company.com' },
    { id: '2', type: 'ai', title: 'Extract Intent', description: 'Uses AI to parse the email and extract client intent and urgency.' },
    { id: '3', type: 'action', title: 'Create Jira Ticket', description: 'Creates a ticket in the engineering board if urgency is high.' },
];

const ProfessionalView = () => {
    const [viewMode, setViewMode] = useState('overview'); // 'overview' | 'builder'
    const [nodes, setNodes] = useState(INITIAL_NODES);
    const [activeNodeId, setActiveNodeId] = useState('2');

    const handleGenerateWorkflow = (prompt) => {
        const newNode = {
            id: Date.now().toString(),
            type: 'ai',
            title: 'Generated Step',
            description: `AI generated action based on: "${prompt}"`
        };

        setNodes((prevNodes) => [...prevNodes, newNode]);
        setActiveNodeId(newNode.id);
    };

    const activeNode = useMemo(() => nodes.find((node) => node.id === activeNodeId), [nodes, activeNodeId]);

    if (viewMode === 'overview') {
        return <ProfessionalOverview onCreateWorkflow={() => setViewMode('builder')} />;
    }

    return (
        <div className="flex-1 flex flex-col w-full h-full bg-white font-['Space_Grotesk','Manrope',sans-serif] overflow-hidden">

            {/* Main Header & Command Area */}
            <div className="w-full bg-white border-b border-slate-200 z-20 flex flex-col px-6 py-4 gap-4 shadow-sm">

                {/* Top Row: Title & Actions */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => setViewMode('overview')}
                            className="p-2 -ml-2 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-colors"
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
                        </button>
                        <div>
                            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Support Ticket Automation</h1>
                            <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[0.65rem] font-bold uppercase tracking-wider text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md">Draft</span>
                                <span className="text-xs font-medium text-slate-500">Last edited 2 mins ago</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <MetricsBar />
                        <button className="ghost text-sm py-2 px-4 rounded-lg font-bold border-slate-200 shadow-sm hover:shadow">Test Run</button>
                        <button className="solid text-sm py-2 px-6 rounded-lg shadow-lg shadow-blue-500/20 hover:shadow-blue-500/40">Deploy</button>
                    </div>
                </div>

                {/* Bottom Row: AI Command Bar */}
                <div className="w-full max-w-4xl">
                    <AICommandBar onGenerate={handleGenerateWorkflow} />
                </div>
            </div>

            {/* Builder Layout Area */}
            <div className="flex-1 flex overflow-hidden bg-slate-50">
                {/* Canvas Area */}
                <div className="flex-1 p-6 flex flex-col">
                    <WorkflowCanvas
                        nodes={nodes}
                        activeNodeId={activeNodeId}
                        onNodeClick={setActiveNodeId}
                    />
                </div>

                {/* Right Sidebar Inspector */}
                <PropertyInspector activeNode={activeNode} />
            </div>

        </div>
    );
};

export default ProfessionalView;
