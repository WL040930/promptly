import { Handle, Position } from '@xyflow/react';
import { getIconByName, resolveNodeUi } from '../builder/utils/iconMap.jsx';

const NODE_STYLES = {
    trigger: {
        icon: 'zap',
        bgColor: 'bg-orange-500',
        color: 'text-white',
    },
    ai: {
        icon: 'message',
        bgColor: 'bg-indigo-500',
        color: 'text-white',
    },
    action: {
        icon: 'zap',
        bgColor: 'bg-emerald-500',
        color: 'text-white',
    },
    logic: {
        icon: 'clock',
        bgColor: 'bg-blue-500',
        color: 'text-white',
    }
};

const DynamicNode = ({ data, type, isConnectable = true }) => {
    const { title, description, schema, isActive, onClick, onDelete, onHandleClick } = data;
    
    const showInputHandle = type !== 'trigger';
    const showOutputHandle = true;

    const nodeUi = resolveNodeUi(data, NODE_STYLES[type] || NODE_STYLES.ai);
    const nodeIcon = getIconByName(nodeUi.icon, { size: 20, strokeWidth: 2.5, className: 'shrink-0' });

    // Calculate dynamic handles based on schema
    const schemaInputs = schema?.inputs?.filter(i => i.isConnection) || [];
    const schemaOutputs = schema?.outputs?.filter(o => o.isConnection) || [];

    const allInputHandles = schemaInputs.map(i => ({ id: i.name, label: i.label || i.name }));
    if (showInputHandle && allInputHandles.length === 0) {
        allInputHandles.push({ id: 'default', label: 'Input' });
    }

    const allOutputHandles = [
        ...schemaOutputs.map(o => ({ id: o.name, label: o.label || o.name }))
    ];
    if (showOutputHandle && allOutputHandles.length === 0) {
        allOutputHandles.push({ id: 'default', label: 'Output' });
    }

    let borderClass = 'border-slate-200 hover:border-slate-300 shadow-sm hover:shadow z-10';
    
    if (data.diffStatus === 'added') {
        borderClass = 'border-emerald-400 ring-2 ring-emerald-400 shadow-[0_0_15px_rgba(52,211,153,0.3)] z-20';
    } else if (data.diffStatus === 'updated') {
        borderClass = 'border-amber-400 ring-2 ring-amber-400 shadow-[0_0_15px_rgba(251,191,36,0.3)] z-20';
    } else if (data.diffStatus === 'removed') {
        borderClass = 'border-red-400 ring-2 ring-red-400 opacity-60 grayscale z-10';
    } else if (isActive) {
        borderClass = 'border-indigo-500 shadow-md ring-1 ring-indigo-500 z-20';
    }

    return (
        <div
            onClick={onClick}
            className={`w-[260px] bg-white rounded-lg border transition-all duration-200 flex flex-row relative overflow-visible items-stretch ${borderClass}`}
        >
            {/* Input Handles (Left) */}
            {allInputHandles.length > 0 && (
                <div className="absolute -left-[6px] top-0 h-full flex flex-col justify-evenly pointer-events-none z-30">
                    {allInputHandles.map((handle) => (
                        <div key={handle.id} className="group relative flex items-center pointer-events-auto">
                            <span className="absolute right-4 opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-bold text-white bg-slate-800 px-2 py-0.5 shadow-md rounded whitespace-nowrap pointer-events-none">
                                {handle.label}
                            </span>
                            <Handle
                                type="target"
                                position={Position.Left}
                                id={handle.id === 'default' ? null : handle.id}
                                isConnectable={isConnectable}
                                className="!w-3 !h-3 !bg-white !border-2 !border-slate-300 hover:!border-indigo-500 hover:!bg-indigo-50 !transition-all !relative !transform-none !left-0 !right-0 !top-0"
                                onClick={(e) => onHandleClick?.(e, handle.id === 'default' ? null : handle.id, 'target')}
                            />
                        </div>
                    ))}
                </div>
            )}

            {/* Left Icon Panel */}
            <div className={`w-16 ${nodeUi.bgColor} rounded-l-lg flex flex-col items-center justify-center shrink-0 border-r border-slate-100`}>
                <div className={`w-6 h-6 flex items-center justify-center ${nodeUi.color}`}>
                    {nodeIcon}
                </div>
            </div>

            {/* Content Body */}
            <div className="p-3 flex flex-col justify-center flex-1 min-w-0 bg-white rounded-r-lg relative group/body">
                {isActive && onDelete && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onDelete();
                        }}
                        className="absolute top-2 right-2 text-slate-400 hover:text-red-500 bg-white hover:bg-red-50 p-1 rounded transition-colors z-30 shadow-sm border border-transparent hover:border-red-200"
                        title="Delete node"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 6h18"></path>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                    </button>
                )}
                
                <h4 className="text-[13px] font-bold text-slate-800 tracking-tight truncate pr-8">
                    {title}
                </h4>
                <p className="text-[11px] font-medium text-slate-500 mt-0.5 line-clamp-2 leading-tight pr-8">
                    {description}
                </p>

            </div>

            {/* Output Handles (Right) */}
            {allOutputHandles.length > 0 && (
                <div className="absolute -right-[6px] top-0 h-full flex flex-col justify-evenly pointer-events-none z-30">
                    {allOutputHandles.map((handle) => (
                        <div key={handle.id} className="group relative flex items-center pointer-events-auto">
                            <span className="absolute left-4 opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-bold text-white bg-slate-800 px-2 py-0.5 shadow-md rounded whitespace-nowrap pointer-events-none">
                                {handle.label}
                            </span>
                            <Handle
                                type="source"
                                position={Position.Right}
                                id={handle.id === 'default' ? null : handle.id}
                                isConnectable={isConnectable}
                                className="!w-3 !h-3 !bg-white !border-2 !border-slate-300 hover:!border-indigo-500 hover:!bg-indigo-50 !transition-all !relative !transform-none !left-0 !right-0 !top-0"
                                onClick={(e) => onHandleClick?.(e, handle.id === 'default' ? null : handle.id, 'source')}
                            />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default DynamicNode;
