import { useState } from 'react';
import { getIconByName, resolveNodeUi } from '../../utils/iconMap.jsx';
import { useNodeLibrary } from '../../hooks/useNodeLibrary.js';
import NodeLibrarySkeleton from './NodeLibrarySkeleton.jsx';

/**
 * The left-hand node library sidebar in the workflow builder.
 * Handles its own search state, loading state, and drag initiation.
 */
const NodeLibrarySidebar = ({ isOpen, onDragStart, onDragEnd }) => {
    const [searchQuery, setSearchQuery] = useState('');
    const { data: nodeLibrary = [], isLoading } = useNodeLibrary();

    return (
        <aside
            className={`bg-slate-50/90 backdrop-blur-md border-r border-slate-200/60 flex flex-col h-full transition-all duration-300 relative z-20 shrink-0 ${
                isOpen ? 'w-72' : 'w-0 opacity-0 overflow-hidden border-none'
            }`}
        >
            {/* Search header */}
            <div className="p-4 border-b border-slate-200 flex flex-col gap-2 shrink-0">
                <h3 className="font-semibold text-slate-900 text-sm">Add steps</h3>
                <div className="relative">
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Find nodes..."
                        className="w-full bg-white border border-slate-200 rounded-lg pl-8 pr-3 py-2 text-sm font-medium text-slate-800 placeholder:text-slate-400 outline-none focus:border-indigo-400 transition-all shadow-inner"
                    />
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="absolute left-2.5 top-2.5 text-slate-400">
                        <circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    </svg>
                </div>
            </div>

            {/* Node list */}
            <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-5">
                {isLoading ? (
                    <NodeLibrarySkeleton />
                ) : (
                    nodeLibrary.map((section) => {
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
                                {/* Category header */}
                                <div className="flex items-center gap-1.5 text-slate-400 px-1 select-none border-b border-slate-200/50 pb-1.5">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                                    </svg>
                                    <span className="text-sm font-bold text-slate-700 tracking-tight">{section.category}</span>
                                </div>

                                {/* Groups */}
                                <div className="flex flex-col gap-4">
                                    {filteredGroups.map(group => (
                                        <div key={group.name} className="flex flex-col gap-2">
                                            <div className="px-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider select-none">
                                                {group.name}
                                            </div>
                                            <div className="flex flex-col gap-2">
                                                {group.items.map(node => {
                                                    const nodeUi = resolveNodeUi(node);
                                                    const nodeIcon = getIconByName(nodeUi.icon, { size: 14, strokeWidth: 2.8 });
                                                    const isDisabled = node.implementationStatus === 'disabled';

                                                    return (
                                                        <div
                                                            key={node.nodeKey || `${node.type}:${node.subType}`}
                                                            draggable={!isDisabled}
                                                            onDragStart={(e) => {
                                                                if (isDisabled) return;
                                                                onDragStart(node);
                                                                e.dataTransfer.setData('application/reactflow-type', node.type);
                                                                e.dataTransfer.setData('application/reactflow-data', JSON.stringify(node));
                                                                e.dataTransfer.effectAllowed = 'copy';
                                                                // Transparent drag image so we can render our own preview
                                                                const img = new Image();
                                                                img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
                                                                e.dataTransfer.setDragImage(img, 0, 0);
                                                            }}
                                                            onDragEnd={isDisabled ? undefined : onDragEnd}
                                                            className={`group bg-white p-3 rounded-xl transition-all duration-300 flex items-start gap-3 border border-slate-200 ${isDisabled ? 'cursor-not-allowed opacity-60' : 'cursor-grab active:cursor-grabbing hover:shadow-md hover:-translate-y-0.5'}`}
                                                        >
                                                            <div className={`mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${nodeUi.bgColor} ${nodeUi.color} group-hover:scale-105 transition-transform`}>
                                                                {nodeIcon}
                                                            </div>
                                                            <div className="flex flex-col flex-1 min-w-0">
                                                                <div className="flex items-center justify-between gap-2 mb-1">
                                                                    <span className="text-[13px] font-bold text-slate-800 truncate group-hover:text-slate-900 transition-colors">{node.title}</span>
                                                                    <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded bg-slate-50 text-slate-400 border border-slate-200 select-none">
                                                                        {isDisabled ? 'Unavailable' : node.type}
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
    );
};

export default NodeLibrarySidebar;
