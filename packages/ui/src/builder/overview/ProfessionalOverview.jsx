import React, { useCallback, useMemo, useState } from 'react';
import OverviewModal from './OverviewModal';

const INITIAL_FOLDERS = [
    { id: 'f1', parentId: null, name: 'Client Onboarding', isExpanded: true },
    { id: 'f2', parentId: null, name: 'Internal Operations', isExpanded: true },
    { id: 'f3', parentId: 'f2', name: 'Weekly Reports', isExpanded: true }
];

const INITIAL_WORKFLOWS = [
    { id: 'w1', folderId: 'f1', name: 'Welcome Email Sequence', status: 'Active', updated: '2 hours ago', iconColor: 'text-green-600', iconBg: 'bg-green-100' },
    { id: 'w2', folderId: 'f1', name: 'Support Ticket Automation', status: 'Draft', updated: 'yesterday', iconColor: 'text-blue-600', iconBg: 'bg-blue-100' },
    { id: 'w3', folderId: 'f3', name: 'Weekly Analytics Engine', status: 'Active', updated: '3 days ago', iconColor: 'text-orange-600', iconBg: 'bg-orange-100' }
];

const MODAL_TYPES = {
    NEW_FOLDER: 'NEW_FOLDER',
    NEW_WORKFLOW: 'NEW_WORKFLOW',
    RENAME_FOLDER: 'RENAME_FOLDER',
    RENAME_WORKFLOW: 'RENAME_WORKFLOW',
    DELETE_FOLDER: 'DELETE_FOLDER',
    DELETE_WORKFLOW: 'DELETE_WORKFLOW'
};

const MODAL_CONFIG = {
    [MODAL_TYPES.NEW_FOLDER]: {
        title: 'Create Root Folder',
        confirmLabel: 'Create',
        placeholder: 'e.g. Sales Automations',
        showInput: true,
        isDestructive: false
    },
    [MODAL_TYPES.NEW_WORKFLOW]: {
        title: 'Create New Workflow',
        confirmLabel: 'Create',
        placeholder: 'e.g. Welcome Email',
        showInput: true,
        isDestructive: false
    },
    [MODAL_TYPES.RENAME_FOLDER]: {
        title: 'Rename Folder',
        confirmLabel: 'Save',
        placeholder: 'Folder name',
        showInput: true,
        isDestructive: false
    },
    [MODAL_TYPES.RENAME_WORKFLOW]: {
        title: 'Rename Workflow',
        confirmLabel: 'Save',
        placeholder: 'Workflow name',
        showInput: true,
        isDestructive: false
    },
    [MODAL_TYPES.DELETE_FOLDER]: {
        title: 'Confirm Deletion',
        confirmLabel: 'Delete',
        showInput: false,
        isDestructive: true,
        message: 'Are you sure you want to delete this folder? All child folders and workflows inside it will be permanently deleted.'
    },
    [MODAL_TYPES.DELETE_WORKFLOW]: {
        title: 'Confirm Deletion',
        confirmLabel: 'Delete',
        showInput: false,
        isDestructive: true,
        message: 'Are you sure you want to delete this workflow? This action cannot be undone.'
    }
};

const buildFoldersByParent = (folders) => {
    const map = new Map();
    folders.forEach((folder) => {
        const list = map.get(folder.parentId) || [];
        list.push(folder);
        map.set(folder.parentId, list);
    });
    return map;
};

const buildWorkflowsByFolder = (workflows) => {
    const map = new Map();
    workflows.forEach((workflow) => {
        const list = map.get(workflow.folderId) || [];
        list.push(workflow);
        map.set(workflow.folderId, list);
    });
    return map;
};

const collectDescendantIds = (folders, rootId) => {
    if (!rootId) return [];

    const byParent = buildFoldersByParent(folders);
    const ids = [];
    const stack = [rootId];

    while (stack.length > 0) {
        const currentId = stack.pop();
        if (!currentId) continue;

        ids.push(currentId);
        const children = byParent.get(currentId) || [];
        children.forEach((child) => stack.push(child.id));
    }

    return ids;
};

const ProfessionalOverview = ({ onCreateWorkflow }) => {
    const [folders, setFolders] = useState(INITIAL_FOLDERS);
    const [workflows, setWorkflows] = useState(INITIAL_WORKFLOWS);
    const [searchQuery, setSearchQuery] = useState('');
    const [modal, setModal] = useState({ isOpen: false, type: null, data: null, inputValue: '' });
    const [dragInfo, setDragInfo] = useState({ type: null, id: null });
    const [dragOverFolderId, setDragOverFolderId] = useState(null);

    const searchValue = searchQuery.trim().toLowerCase();
    const hasSearch = searchValue.length > 0;

    const foldersByParent = useMemo(() => buildFoldersByParent(folders), [folders]);
    const workflowsByFolder = useMemo(() => buildWorkflowsByFolder(workflows), [workflows]);
    const folderById = useMemo(() => new Map(folders.map((folder) => [folder.id, folder])), [folders]);
    const rootFolders = foldersByParent.get(null) || [];
    const modalConfig = modal.type ? MODAL_CONFIG[modal.type] : null;

    const activeWorkflowCount = useMemo(
        () => workflows.filter((workflow) => workflow.status === 'Active').length,
        [workflows]
    );

    const toggleFolder = useCallback((folderId) => {
        setFolders((prev) => prev.map((folder) => (
            folder.id === folderId ? { ...folder, isExpanded: !folder.isExpanded } : folder
        )));
    }, []);

    const openModal = useCallback((type, data = null) => {
        setModal({
            isOpen: true,
            type,
            data,
            inputValue: data?.currentName || ''
        });
    }, []);

    const closeModal = useCallback(() => {
        setModal({ isOpen: false, type: null, data: null, inputValue: '' });
    }, []);

    const handleModalSubmit = useCallback(() => {
        const value = modal.inputValue.trim();

        switch (modal.type) {
            case MODAL_TYPES.NEW_FOLDER:
                if (value) {
                    setFolders((prev) => ([
                        ...prev,
                        { id: `f${Date.now()}`, parentId: null, name: value, isExpanded: true }
                    ]));
                }
                break;
            case MODAL_TYPES.NEW_WORKFLOW:
                if (value && modal.data?.folderId) {
                    setWorkflows((prev) => ([
                        ...prev,
                        {
                            id: `w${Date.now()}`,
                            folderId: modal.data.folderId,
                            name: value,
                            status: 'Draft',
                            updated: 'Just now',
                            iconColor: 'text-blue-600',
                            iconBg: 'bg-blue-100'
                        }
                    ]));
                }
                break;
            case MODAL_TYPES.RENAME_FOLDER:
                if (value && modal.data?.folderId) {
                    setFolders((prev) => prev.map((folder) => (
                        folder.id === modal.data.folderId ? { ...folder, name: value } : folder
                    )));
                }
                break;
            case MODAL_TYPES.RENAME_WORKFLOW:
                if (value && modal.data?.workflowId) {
                    setWorkflows((prev) => prev.map((workflow) => (
                        workflow.id === modal.data.workflowId ? { ...workflow, name: value } : workflow
                    )));
                }
                break;
            case MODAL_TYPES.DELETE_FOLDER: {
                if (!modal.data?.folderId) break;

                const deleteIds = new Set(collectDescendantIds(folders, modal.data.folderId));
                setFolders((prev) => prev.filter((folder) => !deleteIds.has(folder.id)));
                setWorkflows((prev) => prev.filter((workflow) => !deleteIds.has(workflow.folderId)));
                break;
            }
            case MODAL_TYPES.DELETE_WORKFLOW:
                if (modal.data?.workflowId) {
                    setWorkflows((prev) => prev.filter((workflow) => workflow.id !== modal.data.workflowId));
                }
                break;
            default:
                break;
        }

        closeModal();
    }, [closeModal, folders, modal]);

    const onDragStart = useCallback((event, type, id) => {
        event.stopPropagation();
        setDragInfo({ type, id });
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', id);
    }, []);

    const onDragOver = useCallback((event, folderId) => {
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = 'move';
        if (dragOverFolderId !== folderId) setDragOverFolderId(folderId);
    }, [dragOverFolderId]);

    const onDragLeave = useCallback((event, folderId) => {
        event.preventDefault();
        event.stopPropagation();
        if (dragOverFolderId === folderId) setDragOverFolderId(null);
    }, [dragOverFolderId]);

    const isDescendant = useCallback((potentialDescendantId, ancestorId) => {
        if (potentialDescendantId === ancestorId) return true;
        let current = folderById.get(potentialDescendantId);

        while (current) {
            if (current.id === ancestorId) return true;
            current = folderById.get(current.parentId);
        }

        return false;
    }, [folderById]);

    const onDrop = useCallback((event, folderId) => {
        event.preventDefault();
        event.stopPropagation();
        setDragOverFolderId(null);

        if (dragInfo.type === 'WORKFLOW') {
            setWorkflows((prev) => prev.map((workflow) => (
                workflow.id === dragInfo.id ? { ...workflow, folderId } : workflow
            )));
        } else if (dragInfo.type === 'FOLDER') {
            if (!isDescendant(folderId, dragInfo.id)) {
                setFolders((prev) => prev.map((folder) => (
                    folder.id === dragInfo.id ? { ...folder, parentId: folderId } : folder
                )));
            }
        }

        setDragInfo({ type: null, id: null });
    }, [dragInfo, isDescendant]);

    const onDragEnd = useCallback(() => {
        setDragInfo({ type: null, id: null });
        setDragOverFolderId(null);
    }, []);

    const handleRootDrop = useCallback((event) => {
        event.preventDefault();
        if (dragInfo.type === 'FOLDER') {
            setFolders((prev) => prev.map((folder) => (
                folder.id === dragInfo.id ? { ...folder, parentId: null } : folder
            )));
        }

        setDragInfo({ type: null, id: null });
        setDragOverFolderId(null);
    }, [dragInfo]);

    const matchesSearch = useCallback((folder, childFolders, folderWorkflows) => {
        if (!hasSearch) return true;

        const search = searchValue;
        return folder.name.toLowerCase().includes(search)
            || folderWorkflows.some((workflow) => workflow.name.toLowerCase().includes(search))
            || childFolders.some((child) => child.name.toLowerCase().includes(search));
    }, [hasSearch, searchValue]);

    const renderFolderTree = (parentId, depth = 0) => {
        const levelFolders = foldersByParent.get(parentId) || [];

        return levelFolders.map((folder) => {
            const childFolders = foldersByParent.get(folder.id) || [];
            const folderWorkflows = workflowsByFolder.get(folder.id) || [];

            if (!matchesSearch(folder, childFolders, folderWorkflows)) return null;

            const isDragOver = dragOverFolderId === folder.id;
            const isBeingDragged = dragInfo.type === 'FOLDER' && dragInfo.id === folder.id;

            return (
                <div
                    key={folder.id}
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
                            {renderFolderTree(folder.id, depth + 1)}

                            {folderWorkflows.map((workflow) => {
                                if (hasSearch && !workflow.name.toLowerCase().includes(searchValue)) return null;

                                return (
                                    <div
                                        key={workflow.id}
                                        draggable
                                        onDragStart={(event) => onDragStart(event, 'WORKFLOW', workflow.id)}
                                        onDragEnd={onDragEnd}
                                        style={{ marginLeft: `${depth + 1}rem` }}
                                        className={`flex items-center gap-2.5 px-2 py-1.5 bg-white hover:bg-blue-50 rounded-lg cursor-pointer transition-colors group relative border border-transparent hover:border-blue-100 ${dragInfo.type === 'WORKFLOW' && dragInfo.id === workflow.id ? 'opacity-50 border-dashed border-blue-300' : ''}`}
                                    >
                                        <div className="absolute left-1 opacity-0 group-hover:opacity-100 text-slate-400 cursor-grab active:cursor-grabbing transition-opacity">
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="12" r="1"></circle><circle cx="9" cy="5" r="1"></circle><circle cx="9" cy="19" r="1"></circle><circle cx="15" cy="12" r="1"></circle><circle cx="15" cy="5" r="1"></circle><circle cx="15" cy="19" r="1"></circle></svg>
                                        </div>
                                        <div className={`w-7 h-7 rounded-lg ${workflow.iconBg} ${workflow.iconColor} flex items-center justify-center shrink-0 ml-5`}>
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                                        </div>
                                        <div className="flex flex-col flex-1 min-w-0">
                                            <span className="text-sm font-bold text-slate-900 group-hover:text-blue-700 transition-colors leading-tight truncate">{workflow.name}</span>
                                            <span className="text-xs font-medium text-slate-500 leading-tight mt-0.5">{workflow.status} • Updated {workflow.updated}</span>
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
        });
    };

    return (
        <div className="flex-1 overflow-y-auto bg-slate-50 font-['Space_Grotesk','Manrope',sans-serif] relative">
            <div className="max-w-7xl mx-auto px-6 lg:px-8 py-6 flex flex-col gap-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Overview</h1>
                        <p className="text-slate-500 font-medium mt-1">Manage your automations and workspace health</p>
                    </div>

                    <button
                        onClick={onCreateWorkflow}
                        className="bg-blue-600 text-white font-bold py-2.5 px-5 rounded-xl shadow-[0_4px_20px_rgba(37,99,235,0.3)] hover:-translate-y-0.5 hover:shadow-[0_8px_25px_rgba(37,99,235,0.4)] hover:bg-blue-700 transition-all flex items-center gap-2"
                    >
                        Create workflow
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                    </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm relative overflow-hidden group">
                        <div className="absolute -right-4 -top-4 w-20 h-20 bg-green-500/10 rounded-full blur-2xl group-hover:bg-green-500/20 transition-all"></div>
                        <div className="flex items-center justify-between mb-3 relative z-10">
                            <span className="text-sm font-bold text-slate-500 uppercase tracking-wider">Active Automations</span>
                            <div className="w-8 h-8 rounded-full bg-green-50 flex items-center justify-center">
                                <div className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse"></div>
                            </div>
                        </div>
                        <div className="flex items-baseline gap-3 relative z-10">
                            <span className="text-3xl font-extrabold text-slate-900">{activeWorkflowCount}</span>
                            <span className="text-xs font-semibold text-green-600 flex items-center gap-0.5">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"></polyline><polyline points="16 7 22 7 22 13"></polyline></svg>
                                Running now
                            </span>
                        </div>
                    </div>

                    <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm relative overflow-hidden group">
                        <div className="absolute -right-4 -top-4 w-20 h-20 bg-blue-500/10 rounded-full blur-2xl group-hover:bg-blue-500/20 transition-all"></div>
                        <div className="flex items-center justify-between mb-3 relative z-10">
                            <span className="text-sm font-bold text-slate-500 uppercase tracking-wider">Avg Success Rate</span>
                            <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="16 12 12 8 8 12"></polyline><line x1="12" y1="16" x2="12" y2="8"></line></svg>
                            </div>
                        </div>
                        <div className="flex items-baseline gap-3 relative z-10">
                            <span className="text-3xl font-extrabold text-slate-900">99.8%</span>
                            <span className="text-xs font-semibold text-slate-400">Past 30 days</span>
                        </div>
                    </div>

                    <div className="bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-800 rounded-3xl p-5 shadow-xl relative overflow-hidden group">
                        <div className="absolute -right-4 -top-4 w-20 h-20 bg-cyan-500/20 rounded-full blur-2xl group-hover:bg-cyan-500/30 transition-all"></div>
                        <div className="flex items-center justify-between mb-3 relative z-10">
                            <span className="text-sm font-bold text-slate-400 uppercase tracking-wider">AI Tokens Saved</span>
                            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-cyan-400">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
                            </div>
                        </div>
                        <div className="flex items-baseline gap-3 relative z-10">
                            <span className="text-3xl font-extrabold text-white">14.2M</span>
                            <span className="text-xs font-semibold text-cyan-400">Optimal</span>
                        </div>
                    </div>
                </div>

                <div className="flex flex-col gap-3 mt-2">
                    <div className="flex items-center justify-between">
                        <div className="relative group">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 group-focus-within:text-blue-500">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                            </div>
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(event) => setSearchQuery(event.target.value)}
                                placeholder="Search workflows..."
                                className="pl-9 pr-4 py-1.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 placeholder:text-slate-400 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10 transition-all w-72 shadow-sm"
                            />
                        </div>

                        <div className="flex items-center gap-3">
                            <button onClick={() => openModal(MODAL_TYPES.NEW_FOLDER)} className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50 transition-colors active:scale-95">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path><line x1="12" y1="11" x2="12" y2="17"></line><line x1="9" y1="14" x2="15" y2="14"></line></svg>
                                New Folder
                            </button>
                        </div>
                    </div>

                    <div
                        className="bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col p-1.5 gap-0.5"
                        onDragOver={(event) => {
                            event.preventDefault();
                            if (dragOverFolderId !== null) setDragOverFolderId(null);
                        }}
                        onDrop={handleRootDrop}
                    >
                        {rootFolders.length === 0 && (
                            <div className="p-8 text-center text-slate-500 font-medium text-sm">
                                No root folders. Create one to get started.
                            </div>
                        )}

                        {renderFolderTree(null)}
                    </div>
                </div>
            </div>

            {modal.isOpen && (
                <OverviewModal
                    config={modalConfig}
                    inputValue={modal.inputValue}
                    onInputChange={(value) => setModal((prev) => ({ ...prev, inputValue: value }))}
                    onCancel={closeModal}
                    onConfirm={handleModalSubmit}
                />
            )}
        </div>
    );
};

export default ProfessionalOverview;
