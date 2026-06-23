import React, { useCallback, useMemo, useState, useRef } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import OverviewModal from './OverviewModal';
import StatsCards from './components/StatsCards';
import FolderNode from './components/FolderNode';
import { buildFoldersByParent, buildWorkflowsByFolder, collectDescendantIds } from '../utils/treeUtils';

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

const WorkflowOverview = ({ folders, setFolders, workflows, setWorkflows, onCreateWorkflow, onSelectWorkflow }) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [modal, setModal] = useState({ isOpen: false, type: null, data: null, inputValue: '' });
    const [dragInfo, setDragInfo] = useState({ type: null, id: null });
    const [dragOverFolderId, setDragOverFolderId] = useState(null);
    const container = useRef(null);

    useGSAP(() => {
        gsap.from(container.current, { opacity: 0, y: 15, duration: 0.3, ease: 'power2.out' });
    }, { scope: container });

    const searchValue = searchQuery.trim().toLowerCase();
    const hasSearch = searchValue.length > 0;

    // Convert workflows dictionary to array for local lists and calculations
    const workflowsArray = useMemo(() => Object.values(workflows), [workflows]);

    const foldersByParent = useMemo(() => buildFoldersByParent(folders), [folders]);
    const workflowsByFolder = useMemo(() => buildWorkflowsByFolder(workflowsArray), [workflowsArray]);
    const folderById = useMemo(() => new Map(folders.map((folder) => [folder.id, folder])), [folders]);
    
    const rootFolders = foldersByParent.get(null) || [];
    const modalConfig = modal.type ? MODAL_CONFIG[modal.type] : null;

    const activeWorkflowCount = useMemo(
        () => workflowsArray.filter((workflow) => workflow.status === 'Active').length,
        [workflowsArray]
    );

    const toggleFolder = useCallback((folderId) => {
        setFolders((prev) => prev.map((folder) => (
            folder.id === folderId ? { ...folder, isExpanded: !folder.isExpanded } : folder
        )));
    }, [setFolders]);

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
                    const newWfId = `w${Date.now()}`;
                    setWorkflows((prev) => ({
                        ...prev,
                        [newWfId]: {
                            id: newWfId,
                            folderId: modal.data.folderId,
                            name: value,
                            status: 'Draft',
                            lastEdited: 'Just now',
                            iconColor: 'text-blue-600',
                            iconBg: 'bg-blue-100',
                            nodes: []
                        }
                    }));
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
                    setWorkflows((prev) => ({
                        ...prev,
                        [modal.data.workflowId]: {
                            ...prev[modal.data.workflowId],
                            name: value
                        }
                    }));
                }
                break;
            case MODAL_TYPES.DELETE_FOLDER: {
                if (!modal.data?.folderId) break;

                const deleteIds = new Set(collectDescendantIds(folders, modal.data.folderId));
                setFolders((prev) => prev.filter((folder) => !deleteIds.has(folder.id)));
                setWorkflows((prev) => {
                    const next = { ...prev };
                    Object.keys(next).forEach((wfId) => {
                        if (deleteIds.has(next[wfId].folderId)) {
                            delete next[wfId];
                        }
                    });
                    return next;
                });
                break;
            }
            case MODAL_TYPES.DELETE_WORKFLOW:
                if (modal.data?.workflowId) {
                    setWorkflows((prev) => {
                        const next = { ...prev };
                        delete next[modal.data.workflowId];
                        return next;
                    });
                }
                break;
            default:
                break;
        }

        closeModal();
    }, [closeModal, folders, modal, setFolders, setWorkflows]);

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
            setWorkflows((prev) => ({
                ...prev,
                [dragInfo.id]: {
                    ...prev[dragInfo.id],
                    folderId
                }
            }));
        } else if (dragInfo.type === 'FOLDER') {
            if (!isDescendant(folderId, dragInfo.id)) {
                setFolders((prev) => prev.map((folder) => (
                    folder.id === dragInfo.id ? { ...folder, parentId: folderId } : folder
                )));
            }
        }

        setDragInfo({ type: null, id: null });
    }, [dragInfo, isDescendant, setFolders, setWorkflows]);

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
    }, [dragInfo, setFolders]);

    return (
        <div ref={container} className="tab-content flex-1 overflow-y-auto bg-slate-50 font-sans relative p-6 md:p-8">
            <div className="max-w-6xl mx-auto flex flex-col gap-8">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Overview</h1>
                        <p className="text-sm text-slate-500 mt-1">Manage your automations and workspace health</p>
                    </div>

                    <button
                        onClick={onCreateWorkflow}
                        className="bg-blue-600 text-white font-medium text-sm py-2.5 px-5 rounded-xl shadow-sm hover:bg-blue-700 hover:shadow transition-all flex items-center gap-2"
                    >
                        Create workflow
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                    </button>
                </div>

                <StatsCards activeWorkflowCount={activeWorkflowCount} />

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
                                className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-800 placeholder:text-slate-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 transition-all w-72 shadow-sm"
                            />
                        </div>

                        <div className="flex items-center gap-3">
                            <button onClick={() => openModal(MODAL_TYPES.NEW_FOLDER)} className="flex items-center gap-2 px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition-colors active:scale-[0.98]">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path><line x1="12" y1="11" x2="12" y2="17"></line><line x1="9" y1="14" x2="15" y2="14"></line></svg>
                                New Folder
                            </button>
                        </div>
                    </div>

                    <div
                        className="bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col p-2 gap-0.5"
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

                        {rootFolders.map((folder) => (
                            <FolderNode
                                key={folder.id}
                                folder={folder}
                                depth={0}
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

export default WorkflowOverview;
