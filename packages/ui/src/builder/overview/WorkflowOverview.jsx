import React, { useCallback, useMemo, useState, useRef, useEffect } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import OverviewModal from './OverviewModal';
import StatsCards from './components/StatsCards';
import FolderNode from './components/FolderNode';
import { buildFoldersByParent, buildWorkflowsByFolder, collectDescendantIds } from '../utils/treeUtils';
import { createFolder, updateFolder, deleteFolder, createWorkflow, updateWorkflow, deleteWorkflow } from '../../api/backend.js';
import { formatLastEdited } from '../utils/timeUtils.js';
import { useToast } from '../../components/ToastContext.jsx';

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
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isCreateDropdownOpen, setIsCreateDropdownOpen] = useState(false);
    const toast = useToast();
    const [dragInfo, setDragInfo] = useState({ type: null, id: null });
    const [dragOverFolderId, setDragOverFolderId] = useState(null);
    const container = useRef(null);
    const createDropdownRef = useRef(null);
    const fileInputRef = useRef(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (createDropdownRef.current && !createDropdownRef.current.contains(event.target)) {
                setIsCreateDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleImportJson = async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;

        try {
            const text = await file.text();
            const data = JSON.parse(text);
            
            // Basic validation
            if (!data.nodes || !Array.isArray(data.nodes)) {
                throw new Error("Invalid workflow JSON format");
            }

            const wfData = {
                name: data.name || 'Imported Workflow',
                folderId: null,
                status: data.status || 'Draft',
                iconColor: data.iconColor || 'text-indigo-600',
                iconBg: data.iconBg || 'bg-indigo-100',
                nodes: data.nodes
            };

            const newWf = await createWorkflow(wfData);
            setWorkflows((prev) => ({
                ...prev,
                [newWf.id]: newWf
            }));
            
            toast.success('Workflow imported successfully');
            if (onSelectWorkflow) onSelectWorkflow(newWf.id);
        } catch (error) {
            console.error("Failed to import workflow", error);
            toast.error(error.message || "Failed to parse JSON file");
        }
        
        // Reset file input
        event.target.value = '';
        setIsCreateDropdownOpen(false);
    };

    // Force re-render every minute for real-time relative time display
    const [currentTime, setCurrentTime] = useState(() => Date.now());
    
    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(Date.now()), 60000);
        return () => clearInterval(timer);
    }, []);

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
    const rootWorkflows = workflowsByFolder.get(null) || [];
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

    const handleModalSubmit = useCallback(async () => {
        const value = modal.inputValue.trim();

        setIsSubmitting(true);
        try {
            switch (modal.type) {
                case MODAL_TYPES.NEW_FOLDER:
                    if (value) {
                        const newFolder = await createFolder({ name: value, parentId: null });
                        setFolders((prev) => ([
                            ...prev,
                            { ...newFolder, isExpanded: true }
                        ]));
                        toast.success('Folder created successfully');
                    }
                    break;
                case MODAL_TYPES.NEW_WORKFLOW:
                    if (value && modal.data?.folderId) {
                        const wfData = {
                            folderId: modal.data.folderId,
                            name: value,
                            status: 'Draft',
                            iconColor: 'text-indigo-600',
                            iconBg: 'bg-indigo-100',
                            nodes: []
                        };
                        const newWf = await createWorkflow(wfData);
                        setWorkflows((prev) => ({
                            ...prev,
                            [newWf.id]: newWf
                        }));
                        toast.success('Workflow created successfully');
                    }
                    break;
                case MODAL_TYPES.RENAME_FOLDER:
                    if (value && modal.data?.folderId) {
                        await updateFolder(modal.data.folderId, { name: value });
                        setFolders((prev) => prev.map((folder) => (
                            folder.id === modal.data.folderId ? { ...folder, name: value } : folder
                        )));
                        toast.success('Folder renamed');
                    }
                    break;
                case MODAL_TYPES.RENAME_WORKFLOW:
                    if (value && modal.data?.workflowId) {
                        await updateWorkflow(modal.data.workflowId, { name: value });
                        setWorkflows((prev) => ({
                            ...prev,
                            [modal.data.workflowId]: {
                                ...prev[modal.data.workflowId],
                                name: value
                            }
                        }));
                        toast.success('Workflow renamed');
                    }
                    break;
                case MODAL_TYPES.DELETE_FOLDER: {
                    if (!modal.data?.folderId) break;
                    
                    await deleteFolder(modal.data.folderId);
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
                    toast.success('Folder deleted');
                    break;
                }
                case MODAL_TYPES.DELETE_WORKFLOW:
                    if (modal.data?.workflowId) {
                        await deleteWorkflow(modal.data.workflowId);
                        setWorkflows((prev) => {
                            const next = { ...prev };
                            delete next[modal.data.workflowId];
                            return next;
                        });
                        toast.success('Workflow deleted');
                    }
                    break;
                default:
                    break;
            }
        } catch (error) {
            console.error("Failed to perform action", error);
            toast.error(error.message || 'Failed to perform action');
        } finally {
            setIsSubmitting(false);
            closeModal();
        }
    }, [modal, folders, setFolders, setWorkflows, closeModal, toast]);

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

    const onDrop = useCallback(async (event, folderId) => {
        event.preventDefault();
        event.stopPropagation();
        setDragOverFolderId(null);

        try {
            if (dragInfo.type === 'WORKFLOW') {
                await updateWorkflow(dragInfo.id, { folderId });
                setWorkflows((prev) => ({
                    ...prev,
                    [dragInfo.id]: {
                        ...prev[dragInfo.id],
                        folderId
                    }
                }));
            } else if (dragInfo.type === 'FOLDER') {
                if (!isDescendant(folderId, dragInfo.id)) {
                    await updateFolder(dragInfo.id, { parentId: folderId });
                    setFolders((prev) => prev.map((folder) => (
                        folder.id === dragInfo.id ? { ...folder, parentId: folderId } : folder
                    )));
                }
            }
        } catch (e) {
            console.error("Failed to move item", e);
        }

        setDragInfo({ type: null, id: null });
    }, [dragInfo, isDescendant, setFolders, setWorkflows]);

    const onDragEnd = useCallback(() => {
        setDragInfo({ type: null, id: null });
        setDragOverFolderId(null);
    }, []);

    const handleRootDrop = useCallback(async (event) => {
        event.preventDefault();
        try {
            if (dragInfo.type === 'FOLDER') {
                await updateFolder(dragInfo.id, { parentId: null });
                setFolders((prev) => prev.map((folder) => (
                    folder.id === dragInfo.id ? { ...folder, parentId: null } : folder
                )));
            }
        } catch (e) {
            console.error("Failed to move to root", e);
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

                    <div className="relative" ref={createDropdownRef}>
                        <button
                            onClick={() => setIsCreateDropdownOpen(!isCreateDropdownOpen)}
                            className="bg-indigo-600 text-white font-medium text-sm py-2.5 px-5 rounded-xl shadow-sm hover:bg-indigo-700 hover:shadow transition-all flex items-center gap-2"
                        >
                            Create workflow
                            <svg 
                                width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                                className={`transition-transform duration-200 ${isCreateDropdownOpen ? 'rotate-180' : ''}`}
                            >
                                <polyline points="6 9 12 15 18 9"></polyline>
                            </svg>
                        </button>

                        {isCreateDropdownOpen && (
                            <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden z-30 animate-in fade-in slide-in-from-top-2 duration-200">
                                <div className="p-1.5 flex flex-col gap-0.5">
                                    <button 
                                        onClick={() => {
                                            setIsCreateDropdownOpen(false);
                                            onCreateWorkflow();
                                        }}
                                        className="w-full text-left px-3 py-2 text-sm font-medium text-slate-700 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg transition-colors flex items-center gap-2"
                                    >
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                                        Blank workflow
                                    </button>
                                    <button 
                                        onClick={() => fileInputRef.current?.click()}
                                        className="w-full text-left px-3 py-2 text-sm font-medium text-slate-700 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg transition-colors flex items-center gap-2"
                                    >
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                                        Import from JSON
                                    </button>
                                </div>
                            </div>
                        )}
                        <input 
                            type="file" 
                            accept=".json" 
                            className="hidden" 
                            ref={fileInputRef}
                            onChange={handleImportJson} 
                        />
                    </div>
                </div>

                <StatsCards activeWorkflowCount={activeWorkflowCount} />

                <div className="flex flex-col gap-3 mt-2">
                    <div className="flex items-center justify-between">
                        <div className="relative group">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 group-focus-within:text-indigo-500">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                            </div>
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(event) => setSearchQuery(event.target.value)}
                                placeholder="Search workflows..."
                                className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-800 placeholder:text-slate-400 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 transition-all w-72 shadow-sm"
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
                        {rootFolders.length === 0 && rootWorkflows.length === 0 && (
                            <div className="p-8 text-center text-slate-500 font-medium text-sm">
                                No folders or workflows. Create one to get started.
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
                                currentTime={currentTime}
                                formatLastEdited={formatLastEdited}
                            />
                        ))}

                        {rootWorkflows.map((workflow) => {
                            if (hasSearch && !workflow.name.toLowerCase().includes(searchValue)) return null;
                            return (
                                <div
                                    key={workflow.id}
                                    onClick={() => onSelectWorkflow?.(workflow.id, workflow.name, 'Root')}
                                    className={`flex items-center gap-2.5 px-2 py-1.5 bg-white hover:bg-indigo-50 rounded-lg cursor-pointer transition-colors group relative border border-transparent hover:border-indigo-100 ${dragInfo.type === 'WORKFLOW' && dragInfo.id === workflow.id ? 'opacity-50 border-dashed border-indigo-300' : ''}`}
                                >
                                    <div
                                        draggable
                                        onDragStart={(event) => onDragStart(event, 'WORKFLOW', workflow.id)}
                                        onDragEnd={onDragEnd}
                                        className="absolute left-1 opacity-0 group-hover:opacity-100 text-slate-400 cursor-grab active:cursor-grabbing transition-opacity"
                                    >
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="12" r="1"></circle><circle cx="9" cy="5" r="1"></circle><circle cx="9" cy="19" r="1"></circle><circle cx="15" cy="12" r="1"></circle><circle cx="15" cy="5" r="1"></circle><circle cx="15" cy="19" r="1"></circle></svg>
                                    </div>
                                    <div className={`w-7 h-7 rounded-lg ${workflow.iconBg || 'bg-indigo-100'} ${workflow.iconColor || 'text-indigo-600'} flex items-center justify-center shrink-0 ml-5`}>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                                    </div>
                                    <div className="flex flex-col flex-1 min-w-0">
                                        <span className="text-sm font-medium text-slate-900 group-hover:text-indigo-700 transition-colors leading-tight truncate">{workflow.name}</span>
                                        <span className="text-xs font-medium text-slate-500 leading-tight mt-0.5">{workflow.status || 'Draft'} • Updated {formatLastEdited ? formatLastEdited(workflow.updatedAt || workflow.createdAt, currentTime) : workflow.updated || 'Just now'}</span>
                                    </div>
                                    <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity gap-0.5 shrink-0 bg-indigo-50 z-10 px-1 rounded">
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
                    </div>
                </div>
            </div>

            {modal.isOpen && (
                <OverviewModal
                    config={modalConfig}
                    inputValue={modal.inputValue}
                    isSubmitting={isSubmitting}
                    onInputChange={(value) => setModal((prev) => ({ ...prev, inputValue: value }))}
                    onCancel={closeModal}
                    onConfirm={handleModalSubmit}
                />
            )}
        </div>
    );
};

export default WorkflowOverview;
