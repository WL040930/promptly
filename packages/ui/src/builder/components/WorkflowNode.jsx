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
            className={`w-72 bg-white/90 backdrop-blur-md rounded-2xl border transition-all duration-300 cursor-pointer group flex flex-col shadow-sm hover:shadow-xl hover:-translate-y-1 ${isActive
                    ? 'border-blue-500 shadow-[0_0_25px_rgba(59,130,246,0.3)] ring-4 ring-blue-500/20 scale-[1.02] z-10'
                    : 'border-slate-200 hover:border-blue-400'
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
                <div className="flex-1 min-w-0 pr-2">
                    <h4 className="text-sm font-extrabold text-slate-900 truncate">{title}</h4>
                    <p className="text-[11px] font-medium text-slate-500 mt-1 line-clamp-3 leading-relaxed break-words">
                        {description}
                    </p>
                </div>
            </div>

            <div className="px-4 py-2.5 bg-slate-50/80 border-t border-slate-100/80 rounded-b-[15px] flex justify-between items-center text-[10px] font-bold uppercase tracking-wider text-slate-400 group-hover:bg-slate-100/80 group-hover:text-slate-500 transition-colors">
                <span>{typeLabel}</span>
                <span className="flex items-center gap-1.5 bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded border border-emerald-100">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
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
