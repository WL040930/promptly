import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import FormEditor from '../../../forms/FormEditor';
import FormPreview from '../../../forms/FormPreview';
import FormAIAssistant from '../../../forms/FormAIAssistant';
import FormResponses from '../../../forms/FormResponses';
import FormSettings from '../../../forms/FormSettings';
import FormShareModal from '../../../forms/FormShareModal';
import Button from '../../../components/ui/Button.jsx';
import { createField } from '../../../forms/fields/fieldTypes';
import { useForms, useCreateForm, useUpdateForm, useDeleteForm } from '../../../api/hooks/useForms.js';
import { useToast } from '../../../context/ToastContext.jsx';
import { parsePath, buildPath, replacePath } from '../../../utils/router.js';
import { formatCompactRelativeTime } from '../../../utils/time.js';
import ConfirmModal from '../../../components/modals/ConfirmModal.jsx';
import FormsLoadingSkeleton from './FormsLoadingSkeleton.jsx';

/**
 * FormsTab — main orchestrator for the form builder module.
 * Redesigned sidebar and top bar for a premium workspace feel.
 */

const FormsTab = () => {
    const { data: forms = [], isLoading: isFormsLoading } = useForms();
    const createFormMutation = useCreateForm();
    const updateFormMutation = useUpdateForm();
    const deleteFormMutation = useDeleteForm();
    const [activeFormId, setActiveFormId] = useState(() => parsePath(window.location.pathname).formId || null);
    const [activeSubTab, setActiveSubTab] = useState(() => {
        const urlSubTab = parsePath(window.location.pathname).subTab;
        return (urlSubTab && urlSubTab !== 'preview') ? urlSubTab : 'questions';
    });
    const [isPreviewMode, setIsPreviewMode] = useState(() => parsePath(window.location.pathname).subTab === 'preview');
    const [isShareOpen, setIsShareOpen] = useState(false);
    const [sidebarSearch, setSidebarSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');

    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedSearch(sidebarSearch);
        }, 300);
        return () => clearTimeout(handler);
    }, [sidebarSearch]);

    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isCreatingForm, setIsCreatingForm] = useState(false);
    const [formToDelete, setFormToDelete] = useState(null);
    const [isDeleting, setIsDeleting] = useState(false);
    
    const toast = useToast();
    const container = useRef(null);

    const isInitialLoad = useRef(true);
    useEffect(() => {
        if (!isFormsLoading && forms.length > 0 && isInitialLoad.current) {
            isInitialLoad.current = false;
            const urlFormId = parsePath(window.location.pathname).formId;
            if (urlFormId && forms.find(f => f.id === urlFormId)) {
                setActiveFormId(urlFormId);
            } else if (!activeFormId) {
                setActiveFormId(forms[0].id);
            }
        }
    }, [forms, isFormsLoading, activeFormId]);

    // Sync URL when activeFormId, activeSubTab, or isPreviewMode changes
    useEffect(() => {
        if (activeFormId) {
            const currentPath = window.location.pathname;
            const currentSubTab = isPreviewMode ? 'preview' : activeSubTab;
            const newPath = buildPath({ mode: 'workflow', tab: 'forms', formId: activeFormId, subTab: currentSubTab });
            if (currentPath !== newPath) {
                replacePath(newPath);
            }
        }
    }, [activeFormId, activeSubTab, isPreviewMode]);

    // Handle back/forward navigation
    useEffect(() => {
        const handler = () => {
            const parsed = parsePath(window.location.pathname);
            if (parsed.tab === 'forms') {
                if (parsed.formId && parsed.formId !== activeFormId) {
                    setActiveFormId(parsed.formId);
                }
                const urlSubTab = parsed.subTab;
                if (urlSubTab === 'preview') {
                    setIsPreviewMode(true);
                } else if (urlSubTab) {
                    setIsPreviewMode(false);
                    setActiveSubTab(urlSubTab);
                } else {
                    setIsPreviewMode(false);
                    setActiveSubTab('questions');
                }
            }
        };
        window.addEventListener('popstate', handler);
        return () => window.removeEventListener('popstate', handler);
    }, [activeFormId, activeSubTab, isPreviewMode]);

    useGSAP(() => {
        gsap.from(container.current, { opacity: 0, y: 15, duration: 0.3, ease: 'power2.out' });
    }, { scope: container });

    const activeForm = forms.find(f => f.id === activeFormId) || forms[0];
    const accentColor = activeForm?.settings?.accentColor || '#4f46e5';

    // ── Form CRUD ──────────────────────────────────────────────────────────────

    const updateForm = useCallback((updates) => {
        updateFormMutation.mutate({ id: activeFormId, data: updates });
    }, [activeFormId, updateFormMutation]);

    const handleCreateForm = () => {
        setIsCreatingForm(true);
        const newFormPayload = {
            title: 'Untitled Form',
            description: '',
            settings: { accentColor: '#4f46e5', acceptingResponses: true },
            fields: [createField('text')],
        };
        createFormMutation.mutate(newFormPayload, {
            onSuccess: (newForm) => {
                setActiveFormId(newForm.id);
                setActiveSubTab('questions');
                setIsSidebarOpen(false);
                setIsCreatingForm(false);
            },
            onError: () => setIsCreatingForm(false)
        });
    };
    const handleDuplicateForm = (formId) => {
        const source = forms.find(f => f.id === formId);
        if (!source) return;
        
        const duplicated = {
            title: `${source.title} (copy)`,
            description: source.description,
            settings: source.settings,
            fields: source.fields.map(field => ({
                ...field,
                id: `f_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            }))
        };
        
        createFormMutation.mutate(duplicated, {
            onSuccess: (newForm) => {
                setActiveFormId(newForm.id);
                setActiveSubTab('questions');
            }
        });
    };

    const handleDeleteForm = (e, formId) => {
        e.stopPropagation();
        setFormToDelete(formId);
    };

    const confirmDeleteForm = () => {
        if (!formToDelete) return;
        setIsDeleting(true);
        deleteFormMutation.mutate(formToDelete, {
            onSuccess: () => {
                const updatedForms = forms.filter(f => f.id !== formToDelete);
                if (activeFormId === formToDelete) {
                    setActiveFormId(updatedForms.length > 0 ? updatedForms[0].id : null);
                }
                toast.success('Form deleted successfully.');
                setIsDeleting(false);
                setFormToDelete(null);
            },
            onError: () => {
                toast.error('Failed to delete form.');
                setIsDeleting(false);
                setFormToDelete(null);
            }
        });
    };


    // ── Field CRUD ─────────────────────────────────────────────────────────────

    const handleAddField = (newField) => {
        updateForm({ fields: [...activeForm.fields, newField] });
    };


    const handleDuplicateField = (fieldId) => {
        const source = activeForm.fields.find(f => f.id === fieldId);
        if (!source) return;
        const newField = {
            ...JSON.parse(JSON.stringify(source)),
            id: `f_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        };
        const idx = activeForm.fields.findIndex(f => f.id === fieldId);
        const fields = [...activeForm.fields];
        fields.splice(idx + 1, 0, newField);
        updateForm({ fields });
    };

    const handleReorderFields = (fromIndex, toIndex) => {
        const fields = [...activeForm.fields];
        const [moved] = fields.splice(fromIndex, 1);
        fields.splice(toIndex, 0, moved);
        updateForm({ fields });
    };

    // ── Sidebar filtering & sorting ────────────────────────────────────────────

    const filteredForms = useMemo(() => {
        let result = forms;
        if (debouncedSearch) {
            result = result.filter(f => f.title.toLowerCase().includes(debouncedSearch.toLowerCase()));
        }
        // Sort by most recently updated (clone the array to avoid mutating state)
        return [...result].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    }, [forms, debouncedSearch]);

    if (isFormsLoading && forms.length === 0) {
        return <FormsLoadingSkeleton />;
    }

    // ── Sub-tab icons ──────────────────────────────────────────────────────────

    const subTabs = [
        {
            id: 'questions',
            label: 'Questions',
            icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>,
        },
        {
            id: 'ai',
            label: 'AI Builder',
            icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.29 1.29L3 12l5.8 1.9a2 2 0 0 1 1.29 1.29L12 21l1.9-5.8a2 2 0 0 1 1.29-1.29L21 12l-5.8-1.9a2 2 0 0 1-1.29-1.29L12 3Z"></path></svg>,
        },
        {
            id: 'responses',
            label: 'Responses',
            icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>,
        },
        {
            id: 'settings',
            label: 'Settings',
            icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.32 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>,
        },
    ];

    return (
        <div ref={container} className="tab-content flex-1 flex overflow-hidden bg-[#f4f7f9] font-sans h-full relative">

            {/* Mobile Overlay */}
            {isSidebarOpen && (
                <div 
                    className="md:hidden absolute inset-0 z-20 bg-slate-900/40 backdrop-blur-sm transition-opacity" 
                    onClick={() => setIsSidebarOpen(false)}
                />
            )}

            {/* ═══ LEFT SIDEBAR ═══ */}
            <aside className={`w-[280px] border-r border-gray-200/60 bg-white/95 backdrop-blur-md flex flex-col shrink-0 z-30 absolute md:relative h-full transition-transform duration-300 ${isSidebarOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full md:translate-x-0'}`}>
                {/* Sidebar Header */}
                <div className="p-4 flex items-center justify-between shrink-0">
                    <h3 className="font-extrabold text-gray-900 text-[15px] tracking-tight pl-1">Forms</h3>
                    <div className="flex items-center gap-1">
                        <Button
                            variant="ghost"
                            size="icon-md"
                            onClick={handleCreateForm}
                            disabled={isCreatingForm}
                            isLoading={isCreatingForm}
                            className="rounded-xl border border-transparent hover:border-gray-100"
                            title="Create new form"
                            iconLeft={!isCreatingForm && (
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                                </svg>
                            )}
                        />
                        <Button
                            variant="ghost"
                            size="icon-md"
                            onClick={() => setIsSidebarOpen(false)}
                            className="md:hidden rounded-xl border border-transparent hover:border-gray-100 text-gray-500"
                            title="Close Sidebar"
                            iconLeft={
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                                </svg>
                            }
                        />
                    </div>
                </div>

                {/* Search */}
                <div className="px-4 pb-3">
                    <div className="relative group">
                        <input
                            type="text"
                            value={sidebarSearch}
                            onChange={e => setSidebarSearch(e.target.value)}
                            placeholder="Search forms..."
                            className="w-full bg-white/50 backdrop-blur-sm border border-gray-200/80 hover:border-gray-300 rounded-xl pl-9 pr-3 py-2 text-[13px] font-medium text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:bg-white transition-all shadow-inner"
                        />
                        <svg className="absolute left-3 top-2.5 text-gray-400 group-focus-within:text-indigo-500 transition-colors" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                        </svg>
                    </div>
                </div>

                {/* Forms List */}
                <div className="flex-1 overflow-y-auto px-3 pb-4 flex flex-col gap-1.5">
                    {filteredForms.map(form => {
                        const isActive = activeForm.id === form.id;
                        const formAccent = form.settings?.accentColor || '#4f46e5';
                        const timeAgo = formatCompactRelativeTime(form.updatedAt);
                        
                        return (
                            <div
                                key={form.id}
                                onClick={() => { setActiveFormId(form.id); setIsPreviewMode(false); setActiveSubTab('questions'); setIsSidebarOpen(false); }}
                                className={`flex items-start gap-3 px-3.5 py-3.5 rounded-xl cursor-pointer transition-all duration-300 group ${
                                    isActive
                                        ? 'bg-white shadow-md shadow-gray-200/40 border border-gray-100 scale-[1.02]'
                                        : 'text-gray-600 hover:bg-white/50 border border-transparent'
                                }`}
                            >
                                {/* Color dot */}
                                <div className={`w-3 h-3 rounded-full shrink-0 mt-1 transition-transform ${isActive ? 'scale-110 shadow-sm' : ''}`} style={{ backgroundColor: formAccent }} />
                                
                                {/* Text Content */}
                                <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                                    <span className={`truncate text-[14px] ${isActive ? 'font-bold text-gray-900' : 'font-semibold text-gray-700'}`}>
                                        {form.title}
                                    </span>
                                    {timeAgo && (
                                        <span className={`text-[11px] font-medium truncate ${isActive ? 'text-gray-500' : 'text-gray-400'}`}>
                                            Edited {timeAgo}
                                        </span>
                                    )}
                                </div>
                                
                                {/* Actions */}
                                <div className={`flex items-center shrink-0 -mt-0.5 -mr-1 transition-opacity duration-300 ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleDuplicateForm(form.id); }}
                                        className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                                        title="Duplicate"
                                    >
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                        </svg>
                                    </button>
                                    <button
                                        onClick={(e) => handleDeleteForm(e, form.id)}
                                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                        title="Delete"
                                    >
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                            <polyline points="3 6 5 6 21 6" />
                                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        );
                    })}

                    {filteredForms.length === 0 && sidebarSearch && (
                        <div className="text-center py-10">
                            <p className="text-[13px] font-bold text-gray-400">No forms match "{sidebarSearch}"</p>
                        </div>
                    )}
                </div>
            </aside>

            {/* ═══ MAIN CONTENT ═══ */}
            <main className="flex-1 flex flex-col h-full overflow-hidden bg-transparent">
                {!activeForm ? (
                    <div className="flex-1 flex items-center justify-center p-8">
                        <div className="p-12 text-center border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center bg-white/50 max-w-md w-full mx-auto">
                            <div className="w-16 h-16 bg-slate-50 text-slate-400 rounded-full flex items-center justify-center mb-4">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                    <polyline points="14 2 14 8 20 8"></polyline>
                                    <line x1="16" y1="13" x2="8" y2="13"></line>
                                    <line x1="16" y1="17" x2="8" y2="17"></line>
                                    <polyline points="10 9 9 9 8 9"></polyline>
                                </svg>
                            </div>
                            <div className="text-slate-600 font-semibold mb-1">No forms found</div>
                            <div className="text-slate-400 text-sm mb-6">Create a new form to get started.</div>
                            <button
                                onClick={handleCreateForm}
                                disabled={isCreatingForm}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors shadow-sm disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {isCreatingForm ? (
                                    <>
                                        <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                        Creating...
                                    </>
                                ) : (
                                    '+ Create New Form'
                                )}
                            </button>
                        </div>
                    </div>
                ) : (
                    <>
                        {/* Top Bar */}
                        <div className="h-16 bg-white/80 backdrop-blur-md border-b border-gray-200/60 px-3 md:px-6 flex items-center justify-between shrink-0 z-10 shadow-sm">
                            {/* Left: Form name + sub-tabs */}
                            <div className="flex items-center gap-2 md:gap-6 min-w-0 flex-1">
                                <button onClick={() => setIsSidebarOpen(true)} className="md:hidden text-slate-500 hover:text-slate-800 p-1 shrink-0">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
                                </button>
                                    <input
                                        type="text"
                                        value={activeForm.title}
                                        onChange={(e) => updateForm({ title: e.target.value })}
                                        placeholder="Untitled Form"
                                        title="Click to rename"
                                        size={Math.max(15, activeForm.title.length || 15)}
                                        className="text-[15px] font-extrabold text-gray-900 truncate min-w-0 max-w-[150px] md:max-w-[300px] lg:max-w-[400px] 2xl:max-w-[600px] tracking-tight bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-indigo-500/30 rounded hover:bg-gray-100 transition-colors px-2 py-1 -ml-2"
                                    />

                        {/* Sub-tabs */}
                        <div className="flex items-center gap-1 border-l-2 border-gray-100 pl-4 md:pl-6 h-8">
                            {subTabs.map(tab => {
                                const isActive = activeSubTab === tab.id && !isPreviewMode;
                                return (
                                    <button
                                        key={tab.id}
                                        onClick={() => { setActiveSubTab(tab.id); setIsPreviewMode(false); }}
                                        className={`flex items-center gap-2 px-2.5 md:px-3.5 py-2 rounded-xl text-[13px] font-bold transition-all duration-300 ${
                                            isActive
                                                ? 'bg-gray-100 text-gray-900 shadow-sm'
                                                : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50/80'
                                        }`}
                                    >
                                        <span className={isActive ? 'text-gray-800' : 'text-gray-400'}>
                                            {tab.icon}
                                        </span>
                                        <span className="hidden 2xl:inline">{tab.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Right: Actions */}
                    <div className="flex items-center gap-2 md:gap-3 shrink-0">
                        {/* Preview Toggle */}
                        <Button
                            variant={isPreviewMode ? 'primary' : 'outline'}
                            onClick={() => setIsPreviewMode(!isPreviewMode)}
                            className={`px-3 md:px-4 ${isPreviewMode ? 'bg-gray-900 border-gray-900 hover:bg-gray-800' : ''}`}
                            iconLeft={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>}
                        >
                            <span className="hidden 2xl:inline">Preview</span>
                        </Button>

                        {/* Share Button */}
                        <button
                            onClick={() => setIsShareOpen(true)}
                            className="flex items-center gap-2 px-3 md:px-4 py-2 rounded-xl text-[13px] font-bold text-white transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5"
                            style={{ backgroundColor: accentColor, boxShadow: `0 4px 14px ${accentColor}40` }}
                        >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
                                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                            </svg>
                            <span className="hidden 2xl:inline">Share</span>
                        </button>
                    </div>
                </div>

                {/* Body Container */}
                <div className="flex-1 overflow-hidden relative">
                    <div className="w-full h-full animate-slide-up-fade">
                        {isPreviewMode ? (
                            <div className="h-full overflow-y-auto">
                                <div className="p-6 md:p-10 max-w-3xl mx-auto">
                                    <FormPreview form={activeForm} accentColor={accentColor} />
                                </div>
                            </div>
                        ) : activeSubTab === 'questions' ? (
                            <div className="h-full overflow-y-auto">
                                <div className="p-6 md:p-10 max-w-3xl mx-auto">
                                    <FormEditor
                                        form={activeForm}
                                        onUpdateForm={updateForm}
                                        onUpdateField={(fieldId, updates) => {
                                            updateForm({ fields: activeForm.fields.map(f => f.id === fieldId ? { ...f, ...updates } : f) });
                                        }}
                                        onDeleteField={(fieldId) => {
                                            updateForm({ fields: activeForm.fields.map(f => f.id === fieldId ? { ...f, deleted: true } : f) });
                                        }}
                                        onDuplicateField={handleDuplicateField}
                                        onAddField={handleAddField}
                                        onReorderFields={handleReorderFields}
                                        accentColor={accentColor}
                                    />
                                </div>
                            </div>
                        ) : activeSubTab === 'ai' ? (
                            <div className="h-full">
                                    <FormAIAssistant
                                        form={activeForm}
                                        accentColor={accentColor}
                                    />
                            </div>
                        ) : activeSubTab === 'responses' ? (
                            <div className="h-full overflow-y-auto">
                                <div className="p-6 md:p-10 max-w-3xl mx-auto">
                                    <FormResponses form={activeForm} />
                                </div>
                            </div>
                        ) : activeSubTab === 'settings' ? (
                            <div className="h-full overflow-y-auto">
                                <div className="p-6 md:p-10 max-w-3xl mx-auto">
                                    <FormSettings form={activeForm} onUpdateForm={updateForm} />
                                </div>
                            </div>
                        ) : null}
                    </div>
                </div>
                    </>
                )}
            </main>

            {/* Share Modal */}
            {activeForm && (
                <FormShareModal
                    form={activeForm}
                    isOpen={isShareOpen}
                    onClose={() => setIsShareOpen(false)}
                />
            )}

            <ConfirmModal
                isOpen={!!formToDelete}
                onClose={() => setFormToDelete(null)}
                onConfirm={confirmDeleteForm}
                title="Delete Form?"
                message="This action cannot be undone. Are you sure you want to permanently delete this form?"
                confirmText="Delete"
                confirmVariant="danger"
                isLoading={isDeleting}
            />
        </div>
    );
};

export default FormsTab;
