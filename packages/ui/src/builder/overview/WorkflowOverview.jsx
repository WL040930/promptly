import React, { useCallback, useMemo, useState, useRef, useEffect } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import OverviewModal from './OverviewModal';
import FolderNode from './components/FolderNode';
import WorkflowRow from './components/WorkflowRow';
import { MODAL_TYPES, MODAL_CONFIG } from './constants.js';
import { buildFoldersByParent, buildWorkflowsByFolder } from '../utils/treeUtils';
import { useCreateFolder, useDeleteFolder, useUpdateFolder } from '../../api/hooks/useFolders.js';
import { useCreateWorkflow, useDeleteWorkflow, useUpdateWorkflow } from '../../api/hooks/useWorkflows.js';
import { useToast } from '../../context/ToastContext.jsx';
import Button from '../../components/ui/Button.jsx';
import { navigate } from '../../utils/router.js';

const WorkflowOverview = ({ folders, setFolders, workflows, onCreateWorkflow, onSelectWorkflow }) => {
    // ── State & refs ────────────────────────────────────────────────────────
    const [searchQuery, setSearchQuery] = useState('');
    const [modal, setModal] = useState({ isOpen: false, type: null, data: null, inputValue: '', formData: {} });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isCreateDropdownOpen, setIsCreateDropdownOpen] = useState(false);
    const [dragInfo, setDragInfo] = useState({ type: null, id: null });
    const [dragOverFolderId, setDragOverFolderId] = useState(null);
    // Ticker for real-time relative timestamps ("2 mins ago")
    const [currentTime, setCurrentTime] = useState(() => Date.now());

    const container = useRef(null);
    const createDropdownRef = useRef(null);
    const fileInputRef = useRef(null);

    const toast = useToast();
    const createFolderMutation = useCreateFolder();
    const updateFolderMutation = useUpdateFolder();
    const deleteFolderMutation = useDeleteFolder();
    const createWorkflowMutation = useCreateWorkflow();
    const updateWorkflowMutation = useUpdateWorkflow();
    const deleteWorkflowMutation = useDeleteWorkflow();

    // ── Effects ─────────────────────────────────────────────────────────────
    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(Date.now()), 60000);
        return () => clearInterval(timer);
    }, []);

    // Close the "Create automation" dropdown when clicking outside of it
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (createDropdownRef.current && !createDropdownRef.current.contains(event.target)) {
                setIsCreateDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useGSAP(() => {
        gsap.from(container.current, { opacity: 0, y: 15, duration: 0.3, ease: 'power2.out' });
    }, { scope: container });

    // ── Derived data ─────────────────────────────────────────────────────────
    const searchValue = searchQuery.trim().toLowerCase();
    const hasSearch = searchValue.length > 0;

    const workflowsArray = useMemo(() => Object.values(workflows), [workflows]);
    const foldersByParent = useMemo(() => buildFoldersByParent(folders), [folders]);
    const workflowsByFolder = useMemo(() => buildWorkflowsByFolder(workflowsArray), [workflowsArray]);
    const folderById = useMemo(() => new Map(folders.map(f => [f.id, f])), [folders]);

    const rootFolders = foldersByParent.get(null) || [];
    const rootWorkflows = workflowsByFolder.get(null) || [];
    const modalConfig = modal.type ? MODAL_CONFIG[modal.type] : null;

    const handleToggleActive = useCallback(async (workflowId, isActive) => {
        try {
            await updateWorkflowMutation.mutateAsync({ id: workflowId, data: { isActive } });
            toast.success(`Automation ${isActive ? 'activated' : 'deactivated'}`);
        } catch (error) {
            toast.error('Failed to toggle workflow state');
        }
    }, [updateWorkflowMutation, toast]);

    const openAutomationAssistant = useCallback((workflowId = null, prompt = 'Help me create an automation.') => {
        const params = new URLSearchParams();
        if (workflowId) params.set('workflowId', workflowId);
        if (prompt) params.set('prompt', prompt);
        navigate(`/chat/chat?${params.toString()}`);
    }, []);

    // ── Modal helpers ────────────────────────────────────────────────────────
    const openModal = useCallback((type, data = null) => {
        setModal({ 
            isOpen: true, 
            type, 
            data, 
            inputValue: data?.currentName || '',
            formData: {
                name: data?.currentName || '',
                icon: data?.icon || 'default',
                iconColor: data?.iconColor || 'text-indigo-600',
                iconBg: data?.iconBg || 'bg-indigo-100'
            }
        });
    }, []);

    const closeModal = useCallback(() => {
        setModal({ isOpen: false, type: null, data: null, inputValue: '', formData: {} });
    }, []);

    const toggleFolder = useCallback((folderId) => {
        setFolders(prev => prev.map(f => f.id === folderId ? { ...f, isExpanded: !f.isExpanded } : f));
    }, [setFolders]);

    // ── Modal submit handler ─────────────────────────────────────────────────
    const handleModalSubmit = useCallback(async () => {
        const value = modal.inputValue.trim();
        setIsSubmitting(true);

        try {
            switch (modal.type) {
                case MODAL_TYPES.NEW_FOLDER:
                    if (value) {
                        await createFolderMutation.mutateAsync({ name: value, parentId: null });
                        toast.success('Folder created successfully');
                    }
                    break;

                case MODAL_TYPES.NEW_WORKFLOW:
                    if (value && modal.data?.folderId) {
                        await createWorkflowMutation.mutateAsync({
                            folderId: modal.data.folderId,
                            name: value,
                            status: 'Saved',
                            isActive: false,
                            iconColor: 'text-indigo-600',
                            iconBg: 'bg-indigo-100',
                            nodes: []
                        });
                        toast.success('Automation created successfully');
                    }
                    break;

                case MODAL_TYPES.RENAME_FOLDER:
                    if (value && modal.data?.folderId) {
                        await updateFolderMutation.mutateAsync({ id: modal.data.folderId, data: { name: value } });
                        toast.success('Folder renamed');
                    }
                    break;

                case MODAL_TYPES.RENAME_WORKFLOW:
                    if (value && modal.data?.workflowId) {
                        await updateWorkflowMutation.mutateAsync({ id: modal.data.workflowId, data: { name: value } });
                        toast.success('Automation renamed');
                    }
                    break;

                case MODAL_TYPES.EDIT_WORKFLOW_PROPERTIES:
                    if (modal.formData.name && modal.data?.workflowId) {
                        await updateWorkflowMutation.mutateAsync({
                            id: modal.data.workflowId,
                            data: {
                                name: modal.formData.name,
                                icon: modal.formData.icon,
                                iconColor: modal.formData.iconColor,
                                iconBg: modal.formData.iconBg
                            }
                        });
                        toast.success('Automation properties updated');
                    }
                    break;

                case MODAL_TYPES.DELETE_FOLDER: {
                    if (!modal.data?.folderId) break;
                    await deleteFolderMutation.mutateAsync(modal.data.folderId);
                    toast.success('Folder deleted');
                    break;
                }

                case MODAL_TYPES.DELETE_WORKFLOW:
                    if (modal.data?.workflowId) {
                        await deleteWorkflowMutation.mutateAsync(modal.data.workflowId);
                        toast.success('Automation deleted');
                    }
                    break;

                default:
                    break;
            }
        } catch (error) {
            console.error('Failed to perform action', error);
            toast.error(error.message || 'Failed to perform action');
        } finally {
            setIsSubmitting(false);
            closeModal();
        }
    }, [modal, setFolders, closeModal, toast, createFolderMutation, updateFolderMutation, deleteFolderMutation, createWorkflowMutation, updateWorkflowMutation, deleteWorkflowMutation]);

    // ── Drag-and-drop handlers ───────────────────────────────────────────────
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

    const onDragEnd = useCallback(() => {
        setDragInfo({ type: null, id: null });
        setDragOverFolderId(null);
    }, []);

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
                await updateWorkflowMutation.mutateAsync({ id: dragInfo.id, data: { folderId } });
            } else if (dragInfo.type === 'FOLDER') {
                if (!isDescendant(folderId, dragInfo.id)) {
                    await updateFolderMutation.mutateAsync({ id: dragInfo.id, data: { parentId: folderId } });
                }
            }
        } catch (e) {
            console.error('Failed to move item', e);
        }

        setDragInfo({ type: null, id: null });
    }, [dragInfo, isDescendant, updateFolderMutation, updateWorkflowMutation]);

    const handleRootDrop = useCallback(async (event) => {
        event.preventDefault();
        try {
            if (dragInfo.type === 'FOLDER') {
                await updateFolderMutation.mutateAsync({ id: dragInfo.id, data: { parentId: null } });
            }
        } catch (e) {
            console.error('Failed to move to root', e);
        }
        setDragInfo({ type: null, id: null });
        setDragOverFolderId(null);
    }, [dragInfo, updateFolderMutation]);

    // ── JSON import ──────────────────────────────────────────────────────────
    const handleImportJson = async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;

        try {
            const text = await file.text();
            const data = JSON.parse(text);
            if (!data.nodes || !Array.isArray(data.nodes)) throw new Error('Invalid workflow JSON format');

            const newWf = await createWorkflowMutation.mutateAsync({
                name: data.name || 'Imported Automation',
                folderId: null,
                status: data.status || 'Draft',
                iconColor: data.iconColor || 'text-indigo-600',
                iconBg: data.iconBg || 'bg-indigo-100',
                nodes: data.nodes
            });
            toast.success('Automation imported successfully');
            if (onSelectWorkflow) onSelectWorkflow(newWf.id);
        } catch (error) {
            console.error('Failed to import workflow', error);
            toast.error(error.message || 'Failed to parse JSON file');
        }

        event.target.value = '';
        setIsCreateDropdownOpen(false);
    };

    // ── Shared props for FolderNode ───────────────────────────────────────────
    const folderNodeProps = {
        foldersByParent, workflowsByFolder, folderById,
        dragOverFolderId, dragInfo, searchValue, hasSearch,
        toggleFolder, openModal,
        onDragStart, onDragEnd, onDragOver, onDragLeave, onDrop,
        onSelectWorkflow, onToggleActive: handleToggleActive, onAskAI: openAutomationAssistant, currentTime
    };

    // ── Render ───────────────────────────────────────────────────────────────
    return (
        <div ref={container} className="tab-content flex-1 overflow-y-auto bg-slate-50 font-sans relative p-6 md:p-8">
            <div className="max-w-6xl mx-auto flex flex-col gap-8">

                {/* Page header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Automations</h1>
                        <p className="text-sm text-slate-500 mt-1">Manage your automations and workspace health</p>
                    </div>

                    {/* Create automation dropdown */}
                    <div className="relative" ref={createDropdownRef}>
                        <Button
                            variant="primary"
                            onClick={() => setIsCreateDropdownOpen(!isCreateDropdownOpen)}
                            className="shadow-md shadow-indigo-600/20"
                            iconRight={<svg className={`w-4 h-4 transition-transform duration-200 ${isCreateDropdownOpen ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>}
                        >
                            Create automation
                        </Button>

                        {isCreateDropdownOpen && (
                            <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden z-30 animate-in fade-in slide-in-from-top-2 duration-200">
                                <div className="p-1.5 flex flex-col gap-0.5">
                                    <Button
                                        variant="ghost"
                                        onClick={() => { setIsCreateDropdownOpen(false); openAutomationAssistant(); }}
                                        className="w-full justify-start font-medium text-slate-700 hover:text-indigo-700 hover:bg-indigo-50"
                                        iconLeft={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.29 1.29L3 12l5.8 1.9a2 2 0 0 1 1.29 1.29L12 21l1.9-5.8a2 2 0 0 1 1.29-1.29L21 12l-5.8-1.9a2 2 0 0 1-1.29-1.29L12 3Z" /></svg>}
                                    >
                                        Describe with AI
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        onClick={() => { setIsCreateDropdownOpen(false); onCreateWorkflow(); }}
                                        className="w-full justify-start font-medium text-slate-700 hover:text-indigo-700 hover:bg-indigo-50"
                                        iconLeft={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>}
                                    >
                                        Blank automation
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        onClick={() => fileInputRef.current?.click()}
                                        className="w-full justify-start font-medium text-slate-700 hover:text-indigo-700 hover:bg-indigo-50"
                                        iconLeft={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>}
                                    >
                                        Import from JSON
                                    </Button>
                                </div>
                            </div>
                        )}
                        <input type="file" accept=".json" className="hidden" ref={fileInputRef} onChange={handleImportJson} />
                    </div>
                </div>

                <div className="flex flex-col gap-3 mt-2">
                    {/* Toolbar: search + new folder */}
                    <div className="flex items-center justify-between">
                        <div className="relative group">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 group-focus-within:text-indigo-500">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                            </div>
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(event) => setSearchQuery(event.target.value)}
                                placeholder="Search automations..."
                                className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-800 placeholder:text-slate-400 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 transition-all w-72 shadow-sm"
                            />
                        </div>
                        <div className="flex items-center gap-3">
                            <Button
                                variant="outline"
                                onClick={() => openModal(MODAL_TYPES.NEW_FOLDER)}
                                iconLeft={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path><line x1="12" y1="11" x2="12" y2="17"></line><line x1="9" y1="14" x2="15" y2="14"></line></svg>}
                            >
                                New Folder
                            </Button>
                        </div>
                    </div>

                    {/* Main folder/automation tree */}
                    <div
                        className="bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col p-2 gap-0.5"
                        onDragOver={(event) => { event.preventDefault(); if (dragOverFolderId !== null) setDragOverFolderId(null); }}
                        onDrop={handleRootDrop}
                    >
                        {rootFolders.length === 0 && rootWorkflows.length === 0 && (
                            <div className="p-8 text-center text-slate-500 font-medium text-sm">
                                No folders or automations. Create one to get started.
                            </div>
                        )}

                        {rootFolders.map(folder => (
                            <FolderNode key={folder.id} folder={folder} depth={0} {...folderNodeProps} />
                        ))}

                        {rootWorkflows.map(workflow => {
                            if (hasSearch && !workflow.name.toLowerCase().includes(searchValue)) return null;
                            return (
                                <WorkflowRow
                                    key={workflow.id}
                                    workflow={workflow}
                                    dragInfo={dragInfo}
                                    currentTime={currentTime}
                                    openModal={openModal}
                                    onDragStart={onDragStart}
                                    onDragEnd={onDragEnd}
                                    onSelectWorkflow={onSelectWorkflow}
                                    onToggleActive={handleToggleActive}
                                    onAskAI={openAutomationAssistant}
                                    folderName="Root"
                                />
                            );
                        })}
                    </div>
                </div>
            </div>

            {modal.isOpen && (
                <OverviewModal
                    config={modalConfig}
                    inputValue={modal.inputValue}
                    formData={modal.formData}
                    isSubmitting={isSubmitting}
                    onInputChange={(value) => setModal(prev => ({ ...prev, inputValue: value }))}
                    onFormDataChange={(newFormData) => setModal(prev => ({ ...prev, formData: { ...prev.formData, ...newFormData } }))}
                    onCancel={closeModal}
                    onConfirm={handleModalSubmit}
                />
            )}
        </div>
    );
};

export default WorkflowOverview;
