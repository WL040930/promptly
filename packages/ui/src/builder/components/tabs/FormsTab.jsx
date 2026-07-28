import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import FormEditor from '../../../forms/editor/FormEditor';
import FormPreview from '../../../forms/preview/FormPreview';
import FormAIAssistant from '../../../forms/ai/FormAIAssistant';
import FormResponses from '../../../forms/responses/FormResponses';
import FormSettings from '../../../forms/settings/FormSettings';
import FormShareModal from '../../../forms/settings/FormShareModal';
import Button from '../../../components/ui/Button.jsx';
import { createField } from '../../../forms/editor/fields/fieldTypes';
import { useForms, useForm, useCreateForm, useUpdateForm, useDeleteForm } from '../../../api/hooks/useForms.js';
import { useToast } from '../../../context/ToastContext.jsx';
import { parsePath, buildPath, replacePath } from '../../../utils/router.js';
import { formatCompactRelativeTime } from '../../../utils/time.js';
import ConfirmModal from '../../../components/modals/ConfirmModal.jsx';
import FormsLoadingSkeleton from './FormsLoadingSkeleton.jsx';
import { createDebouncedSaveQueue } from '../../../utils/formAutosave.js';

/**
 * FormsTab — main orchestrator for the form builder module.
 * Redesigned sidebar and top bar for a premium workspace feel.
 */

const FormsTab = ({ formId: initialFormId = null, section: initialSection = 'build' } = {}) => {
    const { data: forms = [], isLoading: isFormsLoading } = useForms();
    const initialRoute = parsePath(window.location.href);
    const [activeFormId, setActiveFormId] = useState(() => initialFormId || initialRoute.formId || null);
    const { data: activeFormData, isLoading: isActiveFormLoading } = useForm(activeFormId);
    const createFormMutation = useCreateForm();
    const updateFormMutation = useUpdateForm();
    const deleteFormMutation = useDeleteForm();
    const [activeSubTab, setActiveSubTab] = useState(() => {
        const urlSubTab = initialSection !== 'build' ? initialSection : initialRoute.section;
        return urlSubTab === 'ai' || urlSubTab === 'responses' || urlSubTab === 'settings' ? urlSubTab : 'questions';
    });
    const [isPreviewMode, setIsPreviewMode] = useState(() => (initialSection || initialRoute.section) === 'preview');
    const [isShareOpen, setIsShareOpen] = useState(false);
    const [sidebarSearch, setSidebarSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [draftUpdates, setDraftUpdates] = useState({});
    const saveQueueRef = useRef(null);
    const updateMutationRef = useRef(updateFormMutation.mutateAsync);

    useEffect(() => {
        updateMutationRef.current = updateFormMutation.mutateAsync;
    }, [updateFormMutation.mutateAsync]);

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
            const urlFormId = parsePath(window.location.href).formId;
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
            const newPath = buildPath({ page: 'form-detail', formId: activeFormId, section: currentSubTab === 'questions' ? 'build' : currentSubTab });
            if (currentPath !== newPath) {
                replacePath(newPath);
            }
        }
    }, [activeFormId, activeSubTab, isPreviewMode]);

    // Handle back/forward navigation
    useEffect(() => {
        const handler = () => {
            const parsed = parsePath(window.location.href);
            if (parsed.page === 'form-detail' || parsed.page === 'forms') {
                if (parsed.formId && parsed.formId !== activeFormId) {
                    setActiveFormId(parsed.formId);
                }
                const urlSubTab = parsed.section;
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
        if (!container.current) return;
        gsap.from(container.current, { opacity: 0, y: 15, duration: 0.3, ease: 'power2.out' });
    });

    const remoteActiveForm = activeFormData || null;
    const activeForm = remoteActiveForm ? { ...remoteActiveForm, ...(draftUpdates[remoteActiveForm.id] || {}) } : null;
    const accentColor = activeForm?.settings?.accentColor || '#5b4ee8';

    // ── Form CRUD ──────────────────────────────────────────────────────────────

    useEffect(() => {
        if (!activeFormId) return undefined;
        const queue = createDebouncedSaveQueue({
            delay: 600,
            save: updates => updateMutationRef.current({ id: activeFormId, data: updates })
        });
        saveQueueRef.current = queue;
        return () => { void queue.flush(); };
    }, [activeFormId]);

    const updateForm = useCallback((updates, { immediate = false } = {}) => {
        if (!activeFormId || !saveQueueRef.current) return;
        setDraftUpdates(current => ({ ...current, [activeFormId]: { ...(current[activeFormId] || {}), ...updates } }));
        saveQueueRef.current.schedule(updates);
        if (immediate) void saveQueueRef.current.flush();
    }, [activeFormId]);

    const handleCreateForm = () => {
        setIsCreatingForm(true);
        const newFormPayload = {
            title: 'Untitled Form',
            description: '',
            settings: { accentColor: '#5b4ee8', acceptingResponses: true },
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
        updateForm({ fields: [...activeForm.fields, newField] }, { immediate: true });
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
        updateForm({ fields }, { immediate: true });
    };

    const handleReorderFields = (fromIndex, toIndex) => {
        const fields = [...activeForm.fields];
        const [moved] = fields.splice(fromIndex, 1);
        fields.splice(toIndex, 0, moved);
        updateForm({ fields }, { immediate: true });
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
            label: 'Build',
            icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>,
        },
        {
            id: 'ai',
            label: 'AI Assistant',
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
        <div ref={container} className="tab-content surface-grid relative flex h-full flex-1 overflow-hidden font-sans">

            {/* Mobile Overlay */}
            {isSidebarOpen && (
                <div 
                    className="md:hidden absolute inset-0 z-20 bg-slate-900/40 backdrop-blur-sm transition-opacity" 
                    onClick={() => setIsSidebarOpen(false)}
                />
            )}

            {/* ═══ LEFT SIDEBAR ═══ */}
            <aside className={`z-30 flex h-full w-[280px] shrink-0 flex-col border-r border-slate-200/80 bg-white/95 backdrop-blur-md transition-transform duration-300 md:relative ${isSidebarOpen ? 'absolute translate-x-0 shadow-2xl' : 'absolute -translate-x-full md:relative md:translate-x-0'}`}>
                {/* Sidebar Header */}
                <div className="p-4 flex items-center justify-between shrink-0">
                    <h3 className="pl-1 font-display text-[15px] font-bold tracking-tight text-[#171827]">Forms</h3>
                    <div className="flex items-center gap-1">
                        <Button
                            variant="ghost"
                            size="icon-md"
                            onClick={handleCreateForm}
                            disabled={isCreatingForm}
                            isLoading={isCreatingForm}
                            className="rounded-xl border border-transparent hover:border-gray-100"
                            title="Create new form"
                            aria-label="Create new form"
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
                            aria-label="Close forms sidebar"
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
                            aria-label="Search forms"
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
                        const isActive = activeForm?.id === form.id;
                        const formAccent = form.settings?.accentColor || '#5b4ee8';
                        const timeAgo = formatCompactRelativeTime(form.updatedAt);
                        
                        return (
                            <div
                                key={form.id}
                                onClick={() => { setActiveFormId(form.id); setIsPreviewMode(false); setActiveSubTab('questions'); setIsSidebarOpen(false); }}
                                onKeyDown={(event) => {
                                    if (event.key !== 'Enter' && event.key !== ' ') return;
                                    event.preventDefault();
                                    setActiveFormId(form.id);
                                    setIsPreviewMode(false);
                                    setActiveSubTab('questions');
                                    setIsSidebarOpen(false);
                                }}
                                role="button"
                                tabIndex={0}
                                aria-current={isActive ? 'page' : undefined}
                                className={`group flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3.5 transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5b4ee8]/40 ${
                                    isActive
                                        ? 'scale-[1.02] border-gray-100 bg-white shadow-md shadow-gray-200/40'
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
                                <div className={`flex items-center shrink-0 -mt-0.5 -mr-1 transition-opacity duration-300 ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'}`}>
                                    <button
                                        onClick={(e) => handleDeleteForm(e, form.id)}
                                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                        title="Delete"
                                        aria-label={`Delete ${form.title}`}
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
            <main className="flex-1 min-w-0 flex flex-col h-full overflow-hidden bg-transparent">
                {!activeForm ? (
                    <div className="flex-1 flex items-center justify-center p-8">
                        <div className="mx-auto flex w-full max-w-lg flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-white p-12 text-center">
                            <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50">
                                <svg className="h-8 w-8 text-indigo-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                    <polyline points="14 2 14 8 20 8"></polyline>
                                    <line x1="16" y1="13" x2="8" y2="13"></line>
                                    <line x1="16" y1="17" x2="8" y2="17"></line>
                                    <polyline points="10 9 9 9 8 9"></polyline>
                                </svg>
                            </div>
                            <h3 className="text-lg font-bold tracking-tight text-slate-900">{isActiveFormLoading ? 'Loading form…' : 'No forms found'}</h3>
                            <p className="mx-auto mb-6 mt-2 max-w-sm text-sm text-slate-500">{isActiveFormLoading ? 'Loading the selected form schema.' : 'Create a new form to get started.'}</p>
                            <button
                                onClick={handleCreateForm}
                                hidden={isActiveFormLoading}
                                disabled={isCreatingForm}
                                className="flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:opacity-50"
                            >
                                {isCreatingForm ? (
                                    <>
                                        <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                        Creating...
                                    </>
                                ) : (
                                    <>
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                            <line x1="12" y1="5" x2="12" y2="19" />
                                            <line x1="5" y1="12" x2="19" y2="12" />
                                        </svg>
                                        Create New Form
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                ) : (
                    <>
                        {/* Top Bar */}
                        <div className="h-14 xl:h-16 bg-white/90 backdrop-blur-md border-b border-gray-200/60 px-3 sm:px-4 xl:px-6 flex items-center justify-between shrink-0 z-10 shadow-sm transition-all">
                            {/* Left: Form name */}
                            <div className="flex min-w-0 flex-1 items-center gap-2 pr-2 xl:gap-4 xl:pr-4">
                                <button onClick={() => setIsSidebarOpen(true)} aria-label="Open forms sidebar" className="md:hidden text-slate-500 hover:text-slate-800 p-1 shrink-0 rounded-lg hover:bg-slate-100 transition-colors">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
                                </button>
                                <input
                                    type="text"
                                    value={activeForm.title}
                                    onChange={(e) => updateForm({ title: e.target.value })}
                                    placeholder="Untitled Form"
                                    title="Click to rename"
                                    className="min-w-0 w-full max-w-[400px] rounded-lg border-none bg-transparent px-2 py-1.5 text-[15px] font-extrabold text-gray-900 transition-colors hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 -ml-2"
                                />
                            </div>

                            {/* Center: compact section navigation */}
                            <div className="flex flex-none items-center justify-center">
                                <div role="tablist" aria-label="Form workspace sections" className="flex items-center gap-1 p-1 bg-gray-100/80 rounded-xl border border-gray-200/50">
                                    {subTabs.map(tab => {
                                        const isActive = activeSubTab === tab.id && !isPreviewMode;
                                        return (
                                            <button
                                                key={tab.id}
                                                role="tab"
                                                aria-selected={isActive}
                                                onClick={() => { setActiveSubTab(tab.id); setIsPreviewMode(false); }}
                                                title={tab.label}
                                                aria-label={tab.label}
                                                className={`flex h-8 w-8 items-center justify-center rounded-lg border border-transparent text-[13px] font-bold transition-all duration-300 xl:h-auto xl:w-auto xl:gap-2 xl:px-3 xl:py-1.5 ${
                                                    isActive
                                                        ? 'bg-white text-gray-900 shadow-sm border border-gray-200/60'
                                                        : 'text-gray-500 hover:text-gray-800 hover:bg-black/5 border border-transparent'
                                                }`}
                                            >
                                                <span className={isActive ? 'text-indigo-600' : 'text-gray-400'}>
                                                    {tab.icon}
                                                </span>
                                                <span className="hidden xl:inline">{tab.label}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Right: Actions */}
                            <div className="flex shrink-0 items-center justify-end gap-1.5 pl-2 sm:gap-2 xl:pl-4">
                                <div className="flex items-center gap-0.5 rounded-xl border border-slate-200/80 bg-white p-0.5 shadow-2xs">
                                    <Button
                                        variant={isPreviewMode ? 'secondary' : 'outline'}
                                        size="xs"
                                        onClick={() => setIsPreviewMode(!isPreviewMode)}
                                        title={isPreviewMode ? 'Return to editing' : 'Preview this form'}
                                        iconLeft={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>}
                                        className="h-8 w-8 gap-0 rounded-lg border-transparent px-0 shadow-none hover:border-indigo-200 hover:bg-indigo-50/70 hover:text-indigo-700 xl:w-auto xl:gap-2 xl:px-2.5"
                                    >
                                        <span className="hidden xl:inline">Preview</span>
                                    </Button>
                                    <Button
                                        variant="primary"
                                        size="xs"
                                        onClick={() => setIsShareOpen(true)}
                                        title="Share this form"
                                        iconLeft={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" /></svg>}
                                        className="h-8 w-8 gap-0 rounded-lg px-0 shadow-none xl:w-auto xl:gap-2 xl:px-2.5"
                                    >
                                        <span className="hidden xl:inline">Share</span>
                                    </Button>
                                </div>
                            </div>
                        </div>

                {/* Body Container */}
                <div className="flex-1 overflow-hidden relative">
                    <div className="w-full h-full animate-slide-up-fade">
                        {isPreviewMode ? (
                            <div className="h-full overflow-y-auto">
                                <div className="p-6 md:p-10 max-w-3xl mx-auto">
                                    <FormPreview form={activeForm} accentColor={accentColor} embedded />
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
