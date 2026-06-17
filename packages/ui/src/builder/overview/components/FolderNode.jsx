import React from 'react';

const FolderNode = ({
    folder,
    depth = 0,
    foldersByParent,
    workflowsByFolder,
    folderById,
    dragOverFolderId,
    dragInfo,
    searchValue,
    hasSearch,
    toggleFolder,
    openModal,
    onDragStart,
    onDragEnd,
    onDragOver,
    onDragLeave,
    onDrop,
    onSelectWorkflow,
    MODAL_TYPES
}) => {
    const childFolders = foldersByParent.get(folder.id) || [];
    const folderWorkflows = workflowsByFolder.get(folder.id) || [];

    const matchesSearch = () => {
        if (!hasSearch) return true;
        const search = searchValue;
        return folder.name.toLowerCase().includes(search)
            || folderWorkflows.some((workflow) => workflow.name.toLowerCase().includes(search))
            || childFolders.some((child) => child.name.toLowerCase().includes(search));
    };

    if (!matchesSearch()) return null;

    const isDragOver = dragOverFolderId === folder.id;
    const isBeingDragged = dragInfo.type === 'FOLDER' && dragInfo.id === folder.id;

    return (
        <div
            className={`flex flex-col rounded-xl transition-colors ${isDragOver ? 'bg-blue-50 ring-2 ring-blue-300 ring-inset' : ''} ${isBeingDragged ? 'opacity-50' : ''}`}
            onDragOver={(event) => onDragOver(event, folder.id)}
            onDragLeave={(event) => onDragLeave(event, folder.id)}
            onDrop={(event) => onDrop(event, folder.id)}
        >
            <div
                onClick={() => toggleFolder(folder.id)}
                className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 rounded-xl cursor-pointer transition-colors group select-none relative"
                style={{ marginLeft: `${depth}rem` }}
            >
                <div
                    draggable
                    onDragStart={(event) => onDragStart(event, 'FOLDER', folder.id)}
                    onDragEnd={onDragEnd}
                    className="absolute left-1 opacity-0 group-hover:opacity-100 text-slate-400 cursor-grab active:cursor-grabbing transition-opacity"
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="12" r="1"></circle><circle cx="9" cy="5" r="1"></circle><circle cx="9" cy="19" r="1"></circle><circle cx="15" cy="12" r="1"></circle><circle cx="15" cy="5" r="1"></circle><circle cx="15" cy="19" r="1"></circle></svg>
                </div>

                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={`text-slate-400 transition-transform duration-200 ml-3 shrink-0 ${folder.isExpanded ? 'rotate-90' : ''}`}><polyline points="9 18 15 12 9 6"></polyline></svg>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 transition-colors ${folder.isExpanded ? 'text-blue-500' : 'text-slate-400'}`}><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
                <span className="font-bold text-sm text-slate-700 truncate">{folder.name}</span>

                <span className="ml-auto text-xs font-semibold text-slate-400 shrink-0">{childFolders.length + folderWorkflows.length} items</span>

                <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity gap-0.5 ml-2 shrink-0 bg-white shadow-[0_0_10px_white] z-10 rounded-lg">
                    <button onClick={(event) => { event.stopPropagation(); openModal(MODAL_TYPES.RENAME_FOLDER, { folderId: folder.id, currentName: folder.name }); }} className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors" title="Rename Folder">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
                    </button>
                    <button onClick={(event) => { event.stopPropagation(); openModal(MODAL_TYPES.NEW_WORKFLOW, { folderId: folder.id }); }} className="p-1 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-100 transition-colors" title="Add Workflow">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                    </button>
                    <button onClick={(event) => { event.stopPropagation(); openModal(MODAL_TYPES.DELETE_FOLDER, { folderId: folder.id }); }} className="p-1 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-100 transition-colors" title="Delete Folder">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    </button>
                </div>
            </div>

            {folder.isExpanded && (
                <div className="flex flex-col gap-0.5 mt-0.5">
                    {/* Recursive subfolders rendering */}
                    {childFolders.map((childFolder) => (
                        <FolderNode
                            key={childFolder.id}
                            folder={childFolder}
                            depth={depth + 1}
                            foldersByParent={foldersByParent}
                            workflowsByFolder={workflowsByFolder}
                            folderById={folderById}
                            dragOverFolderId={dragOverFolderId}
                            dragInfo={dragInfo}
                            searchValue={searchValue}
                            hasSearch={hasSearch}
                            toggleFolder={toggleFolder}
                            openModal={openModal}
                            onDragStart={onDragStart}
                            onDragEnd={onDragEnd}
                            onDragOver={onDragOver}
                            onDragLeave={onDragLeave}
                            onDrop={onDrop}
                            onSelectWorkflow={onSelectWorkflow}
                            MODAL_TYPES={MODAL_TYPES}
                        />
                    ))}

                    {/* Sub-workflows rendering */}
                    {folderWorkflows.map((workflow) => {
                        if (hasSearch && !workflow.name.toLowerCase().includes(searchValue)) return null;

                        return (
                            <div
                                key={workflow.id}
                                onClick={() => onSelectWorkflow?.(workflow.id, workflow.name, folderById.get(workflow.folderId)?.name)}
                                style={{ marginLeft: `${depth + 1}rem` }}
                                className={`flex items-center gap-2.5 px-2 py-1.5 bg-white hover:bg-blue-50 rounded-lg cursor-pointer transition-colors group relative border border-transparent hover:border-blue-100 ${dragInfo.type === 'WORKFLOW' && dragInfo.id === workflow.id ? 'opacity-50 border-dashed border-blue-300' : ''}`}
                            >
                                <div
                                    draggable
                                    onDragStart={(event) => onDragStart(event, 'WORKFLOW', workflow.id)}
                                    onDragEnd={onDragEnd}
                                    className="absolute left-1 opacity-0 group-hover:opacity-100 text-slate-400 cursor-grab active:cursor-grabbing transition-opacity"
                                >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="12" r="1"></circle><circle cx="9" cy="5" r="1"></circle><circle cx="9" cy="19" r="1"></circle><circle cx="15" cy="12" r="1"></circle><circle cx="15" cy="5" r="1"></circle><circle cx="15" cy="19" r="1"></circle></svg>
                                </div>
                                <div className={`w-7 h-7 rounded-lg ${workflow.iconBg || 'bg-blue-100'} ${workflow.iconColor || 'text-blue-600'} flex items-center justify-center shrink-0 ml-5`}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                                </div>
                                <div className="flex flex-col flex-1 min-w-0">
                                    <span className="text-sm font-bold text-slate-900 group-hover:text-blue-700 transition-colors leading-tight truncate">{workflow.name}</span>
                                    <span className="text-xs font-medium text-slate-500 leading-tight mt-0.5">{workflow.status || 'Draft'} • Updated {workflow.updated || 'Just now'}</span>
                                </div>
                                <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity gap-0.5 shrink-0 bg-blue-50 z-10 px-1 rounded">
                                    <button onClick={(event) => { event.stopPropagation(); openModal(MODAL_TYPES.RENAME_WORKFLOW, { workflowId: workflow.id, currentName: workflow.name }); }} className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-all">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
                                    </button>
                                    <button onClick={(event) => { event.stopPropagation(); openModal(MODAL_TYPES.DELETE_WORKFLOW, { workflowId: workflow.id }); }} className="p-1 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-200 transition-all">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                    </button>
                                </div>
                            </div>
                        );
                    })}

                    {childFolders.length === 0 && folderWorkflows.length === 0 && (
                        <div style={{ marginLeft: `${depth + 1}rem` }} className="text-xs font-medium text-slate-400 px-3 py-1.5 italic">Empty folder</div>
                    )}
                </div>
            )}
        </div>
    );
};

export default FolderNode;
