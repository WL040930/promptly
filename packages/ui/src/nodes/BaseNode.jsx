import React from 'react';
import { Handle, Position } from '@xyflow/react';

const NODE_STYLES = {
    trigger: {
        iconBg: 'bg-orange-500',
        text: 'text-orange-500',
        icon: (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-white">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
            </svg>
        ),
    },
    ai: {
        iconBg: 'bg-indigo-500',
        text: 'text-indigo-500',
        icon: (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-white">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
        ),
    },
    action: {
        iconBg: 'bg-emerald-500',
        text: 'text-emerald-500',
        icon: (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-white">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
            </svg>
        ),
    },
    logic: {
        iconBg: 'bg-blue-500',
        text: 'text-blue-500',
        icon: (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-white">
                <circle cx="12" cy="12" r="10"></circle>
                <path d="M12 8v4l3 3"></path>
            </svg>
        ),
    }
};

const BaseNode = ({
    type = 'ai',
    title,
    description,
    isActive,
    onClick,
    isConnectable = true,
    showInputHandle = type !== 'trigger',
    showOutputHandle = true,
    customOutputHandles,
    icon,
    children
}) => {
    const style = NODE_STYLES[type] || NODE_STYLES.ai;
    const nodeIcon = icon || style.icon;

    // If customOutputHandles is provided, we map through them, otherwise we render the default single handle if showOutputHandle is true
    return (
        <div
            onClick={onClick}
            className={`w-[260px] bg-white rounded-lg border transition-all duration-200 flex flex-row relative overflow-visible items-stretch ${
                isActive
                    ? 'border-indigo-500 shadow-md ring-1 ring-indigo-500 z-20'
                    : 'border-slate-200 hover:border-slate-300 shadow-sm hover:shadow z-10'
            }`}
        >
            {/* Input Handle (Left) */}
            {showInputHandle && (
                <Handle
                    type="target"
                    position={Position.Left}
                    isConnectable={isConnectable}
                    className="!w-3 !h-3 !bg-white !border-2 !border-slate-300 hover:!border-indigo-500 hover:!scale-125 !transition-all"
                    style={{ left: '-6px' }}
                />
            )}

            {/* Left Icon Panel */}
            <div className={`w-16 ${style.iconBg} rounded-l-lg flex flex-col items-center justify-center shrink-0 border-r border-slate-100`}>
                {nodeIcon}
            </div>

            {/* Content Body */}
            <div className="p-3 flex flex-col justify-center flex-1 min-w-0 bg-white rounded-r-lg relative">
                <h4 className="text-[13px] font-bold text-slate-800 tracking-tight truncate pr-8">
                    {title}
                </h4>
                <p className="text-[11px] font-medium text-slate-500 mt-0.5 line-clamp-2 leading-tight pr-8">
                    {description}
                </p>
                {children}
            </div>

            {/* Output Handles (Right) */}
            {customOutputHandles && customOutputHandles.length > 0 ? (
                <div className="absolute -right-[6px] top-0 h-full flex flex-col justify-evenly pointer-events-none">
                    {customOutputHandles.map((handle) => (
                        <div key={handle.id} className="relative flex items-center pointer-events-auto">
                            <span className="absolute right-3 text-[9px] font-bold text-slate-500 bg-white px-1 shadow-sm rounded-sm whitespace-nowrap">
                                {handle.label}
                            </span>
                            <Handle
                                type="source"
                                position={Position.Right}
                                id={handle.id}
                                isConnectable={isConnectable}
                                className="!w-3 !h-3 !bg-white !border-2 !border-slate-300 hover:!border-indigo-500 hover:!scale-125 !transition-all !relative !transform-none !left-0 !right-0 !top-0"
                            />
                        </div>
                    ))}
                </div>
            ) : showOutputHandle ? (
                <Handle
                    type="source"
                    position={Position.Right}
                    isConnectable={isConnectable}
                    className="!w-3 !h-3 !bg-white !border-2 !border-slate-300 hover:!border-indigo-500 hover:!scale-125 !transition-all"
                    style={{ right: '-6px' }}
                />
            ) : null}
        </div>
    );
};

export default BaseNode;
