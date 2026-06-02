import React from 'react';
import WorkflowNode from './WorkflowNode';

const GRID_STYLE = {
    backgroundImage: 'radial-gradient(#cbd5e1 1px, transparent 1px)',
    backgroundSize: '24px 24px'
};

const WorkflowCanvas = ({ nodes, activeNodeId, onNodeClick }) => {
    return (
        <div className="flex-1 relative bg-[#f8fafc] overflow-auto border border-slate-200 rounded-2xl shadow-inner min-h-[400px]">
            <div className="absolute inset-0 z-0 opacity-40 pointer-events-none" style={GRID_STYLE} />

            <div className="absolute inset-0 z-10 p-12 flex flex-col items-center gap-12 min-w-max">
                {nodes.map((node, index) => (
                    <React.Fragment key={node.id}>
                        {index > 0 && (
                            <div className="h-12 w-0.5 bg-slate-200 relative -my-12 z-0">
                                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-blue-500 rounded-full animate-[ping_2s_cubic-bezier(0,0,0.2,1)_infinite]"></div>
                                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-blue-500 rounded-full animate-[drop_2s_linear_infinite]"></div>
                            </div>
                        )}

                        <div className="relative z-10">
                            <WorkflowNode
                                type={node.type}
                                title={node.title}
                                description={node.description}
                                isActive={node.id === activeNodeId}
                                onClick={() => onNodeClick(node.id)}
                            />
                        </div>
                    </React.Fragment>
                ))}
            </div>

            <style dangerouslySetInnerHTML={{
                __html: `
                @keyframes drop {
                    0% { transform: translate(-50%, 0); opacity: 0; }
                    10% { opacity: 1; }
                    90% { opacity: 1; }
                    100% { transform: translate(-50%, 48px); opacity: 0; }
                }
            `}} />
        </div>
    );
};

export default WorkflowCanvas;
