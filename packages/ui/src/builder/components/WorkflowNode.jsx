import React from 'react';
import { Handle, Position } from '@xyflow/react';

const NODE_STYLES = {
    trigger: {
        icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-orange-600">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
            </svg>
        ),
        badge: 'bg-orange-50 border border-orange-100'
    },
    ai: {
        icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-blue-600">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
        ),
        badge: 'bg-blue-50 border border-blue-100'
    },
    action: {
        icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-600">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
            </svg>
        ),
        badge: 'bg-emerald-50 border border-emerald-100'
    }
};

const WorkflowNode = ({ type, data, isConnectable }) => {
    const { title, description, isActive, onClick } = data;
    const nodeStyle = NODE_STYLES[type] || NODE_STYLES.ai;
    const typeLabel = type || 'node';

    return (
        <div
            onClick={onClick}
            className={`w-64 bg-white rounded-xl border-2 transition-all cursor-pointer group flex flex-col shadow-sm hover:shadow-md ${isActive
                    ? 'border-blue-500 shadow-blue-500/10 scale-[1.02]'
                    : 'border-slate-200 hover:border-blue-300'
                }`}
        >
            {/* Input Handle (don't show for triggers) */}
            {type !== 'trigger' && (
                <Handle
                    type="target"
                    position={Position.Top}
                    isConnectable={isConnectable}
                    className="w-3 h-3 bg-slate-200 border-2 border-white"
                />
            )}

            <div className="p-4 flex items-start gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 shadow-inner ${nodeStyle.badge}`}>
                    {nodeStyle.icon}
                </div>
                <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-bold text-slate-900 truncate">{title}</h4>
                    <p className="text-xs font-medium text-slate-500 mt-0.5 line-clamp-2 leading-relaxed">
                        {description}
                    </p>
                </div>
            </div>

            <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 rounded-b-[10px] flex justify-between items-center text-[0.65rem] font-bold uppercase tracking-wider text-slate-400 group-hover:bg-slate-100 transition-colors">
                <span>{typeLabel}</span>
                <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                    Ready
                </span>
            </div>

            {/* Output Handle */}
            <Handle
                type="source"
                position={Position.Bottom}
                isConnectable={isConnectable}
                className="w-3 h-3 bg-blue-500 border-2 border-white"
            />
        </div>
    );
};

export default WorkflowNode;
