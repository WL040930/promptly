import React from 'react';
import { Handle, Position } from '@xyflow/react';

const NODE_STYLES = {
    trigger: {
        themeColor: 'from-orange-500 to-amber-500',
        badge: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
        glow: 'shadow-[0_0_20px_rgba(249,115,22,0.15)]',
        bgGradient: 'from-orange-50/20 to-transparent',
        icon: (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-white">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
            </svg>
        ),
    },
    ai: {
        themeColor: 'from-indigo-500 to-indigo-600',
        badge: 'bg-indigo-500/10 text-indigo-600 border-indigo-500/20',
        glow: 'shadow-[0_0_20px_rgba(99,102,241,0.15)]',
        bgGradient: 'from-indigo-50/20 to-transparent',
        icon: (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-white">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
        ),
    },
    action: {
        themeColor: 'from-emerald-500 to-teal-600',
        badge: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
        glow: 'shadow-[0_0_20px_rgba(16,185,129,0.15)]',
        bgGradient: 'from-emerald-50/20 to-transparent',
        icon: (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-white">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
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
    icon,
    children
}) => {
    const style = NODE_STYLES[type] || NODE_STYLES.ai;
    const nodeIcon = icon || style.icon;

    return (
        <div
            onClick={onClick}
            className={`w-[290px] bg-white rounded-2xl border transition-all duration-500 flex flex-col relative overflow-visible ${
                isActive
                    ? 'border-indigo-600 shadow-[0_0_30px_rgba(59,130,246,0.3)] ring-2 ring-indigo-600/20 scale-[1.03] z-20'
                    : 'border-slate-200/80 hover:border-slate-300 shadow-[0_4px_20px_rgba(0,0,0,0.03)] hover:shadow-[0_12px_30px_rgba(0,0,0,0.06)] hover:-translate-y-1 z-10'
            }`}
        >
            {/* Header: vibrant header panel with title and status */}
            <div className={`px-4 py-3 bg-gradient-to-r ${style.themeColor} rounded-t-2xl flex items-center justify-between text-white relative`}>
                <div className="flex items-center gap-2.5">
                    {/* Glowing floating icon */}
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-white/20 backdrop-blur-md shadow-inner transition-transform duration-300 group-hover:scale-105">
                        {nodeIcon}
                    </div>
                    <span className="text-[10px] font-black tracking-widest uppercase opacity-90 select-none">
                        {type}
                    </span>
                </div>
                
                {/* Small Pill indicator */}
                <div className="flex items-center gap-1.5 bg-white/15 backdrop-blur-md px-2 py-0.5 rounded-full border border-white/10 text-[9px] font-bold">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></span>
                    Ready
                </div>
            </div>

            {/* Input Handle */}
            {showInputHandle && (
                <Handle
                    type="target"
                    position={Position.Top}
                    isConnectable={isConnectable}
                    className="!w-3 !h-3 !bg-white !border-2 !border-slate-300 hover:!border-indigo-500 hover:!scale-125 !transition-all !shadow-sm"
                    style={{ top: '0px' }}
                />
            )}

            {/* Content Body */}
            <div className={`p-4 flex flex-col bg-gradient-to-b ${style.bgGradient} rounded-b-2xl flex-1`}>
                <h4 className="text-[13.5px] font-extrabold text-slate-800 tracking-tight leading-snug">
                    {title}
                </h4>
                <p className="text-[10.5px] font-medium text-slate-500 mt-1.5 line-clamp-2 leading-relaxed break-words">
                    {description}
                </p>

                {children}
            </div>

            {/* Output Handle */}
            {showOutputHandle && (
                <Handle
                    type="source"
                    position={Position.Bottom}
                    isConnectable={isConnectable}
                    className="!w-3 !h-3 !bg-white !border-2 !border-indigo-500 hover:!scale-125 hover:!bg-indigo-50 !transition-all !shadow-[0_2px_6px_rgba(59,130,246,0.3)]"
                    style={{ bottom: '0px' }}
                />
            )}
        </div>
    );
};

export default BaseNode;
