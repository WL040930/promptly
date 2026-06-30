import React, { useState, useEffect, useCallback, useRef } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import FormEditor from '../../forms/FormEditor';
import FormPreview from '../../forms/FormPreview';
import FormResponses from '../../forms/FormResponses';
import FormSettings from '../../forms/FormSettings';
import FormShareModal from '../../forms/FormShareModal';
import { createField } from '../../forms/fields/fieldTypes';
import { getForms, createForm, updateForm as apiUpdateForm, deleteForm } from '../../api/backend.js';

/**
 * FormsTab — main orchestrator for the form builder module.
 * Redesigned sidebar and top bar for a premium workspace feel.
 */

const FormsTab = () => {
    const [forms, setForms] = useState([]);
    const [activeFormId, setActiveFormId] = useState(null);
    const [activeSubTab, setActiveSubTab] = useState('questions'); // 'questions' | 'responses' | 'settings'
    const [isPreviewMode, setIsPreviewMode] = useState(false);
    const [isShareOpen, setIsShareOpen] = useState(false);
    const [sidebarSearch, setSidebarSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const container = useRef(null);

    useEffect(() => {
        getForms().then(data => {
            setForms(data);
            if (data.length > 0) {
                setActiveFormId(data[0].id);
            }
            setLoading(false);
        }).catch(err => {
            console.error(err);
            setLoading(false);
        });
    }, []);

    useGSAP(() => {
        gsap.from(container.current, { opacity: 0, y: 15, duration: 0.3, ease: 'power2.out' });
    }, { scope: container });

    const activeForm = forms.find(f => f.id === activeFormId) || forms[0];
    const accentColor = activeForm?.settings?.accentColor || '#4f46e5';

    // ── Form CRUD ──────────────────────────────────────────────────────────────

    const updateForm = useCallback(async (updates) => {
        try {
            // Optimistic update
            setForms(prev => prev.map(f => {
                if (f.id === activeFormId) {
                    return { ...f, ...updates };
                }
                return f;
            }));
            
            // Sync with backend
            await apiUpdateForm(activeFormId, updates);
        } catch (e) {
            console.error('Failed to update form', e);
        }
    }, [activeFormId]);

    const handleCreateForm = async () => {
        try {
            const newFormPayload = {
                title: 'Untitled Form',
                description: '',
                settings: { accentColor: '#4f46e5', acceptingResponses: true },
                fields: [createField('text')],
            };
            const newForm = await createForm(newFormPayload);
            setForms(prev => [...prev, newForm]);
            setActiveFormId(newForm.id);
            setActiveSubTab('questions');
            setIsSidebarOpen(false);
        } catch (e) {
            console.error('Failed to create form', e);
        }
    };
    const handleDuplicateForm = async (formId) => {
        try {
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
            
            const newForm = await createForm(duplicated);
            setForms(prev => [...prev, newForm]);
            setActiveFormId(newForm.id);
        } catch (e) {
            console.error('Failed to duplicate form', e);
        }
    };

    const handleDeleteForm = async (e, formId) => {
        e.stopPropagation();
        
        try {
            await deleteForm(formId);
            setForms(prev => prev.filter(f => f.id !== formId));
            if (activeFormId === formId) {
                const remaining = forms.filter(f => f.id !== formId);
                setActiveFormId(remaining.length > 0 ? remaining[0].id : null);
            }
        } catch (e) {
            console.error('Failed to delete form', e);
        }
    };

    // ── Field CRUD ─────────────────────────────────────────────────────────────

    const handleAddField = (newField) => {
        updateForm({ fields: [...activeForm.fields, newField] });
    };

    const handleUpdateField = (fieldId, updates) => {
        updateForm({
            fields: activeForm.fields.map(f =>
                f.id === fieldId ? { ...f, ...updates } : f
            ),
        });
    };

    const handleDeleteField = (fieldId) => {
        updateForm({
            fields: activeForm.fields.filter(f => f.id !== fieldId),
        });
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

    // ── Sidebar filtering ──────────────────────────────────────────────────────

    const filteredForms = sidebarSearch
        ? forms.filter(f => f.title.toLowerCase().includes(sidebarSearch.toLowerCase()))
        : forms;

    // ── Sub-tab icons ──────────────────────────────────────────────────────────

    const subTabs = [
        {
            id: 'questions',
            label: 'Questions',
            icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>,
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
                <div className="absolute inset-0 bg-black/20 z-20 md:hidden" onClick={() => setIsSidebarOpen(false)}></div>
            )}

            {/* ═══ LEFT SIDEBAR ═══ */}
            <aside className={`w-[280px] border-r border-gray-200/60 bg-white/95 backdrop-blur-md flex flex-col shrink-0 z-30 absolute md:relative h-full transition-transform duration-300 ${isSidebarOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full md:translate-x-0'}`}>
                {/* Sidebar Header */}
                <div className="p-4 flex items-center justify-between shrink-0">
                    <h3 className="font-extrabold text-gray-900 text-[15px] tracking-tight pl-1">Forms</h3>
                    <button
                        onClick={handleCreateForm}
                        className="p-1.5 rounded-xl text-gray-400 hover:text-gray-900 hover:bg-white hover:shadow-sm border border-transparent hover:border-gray-100 transition-all"
                        title="Create new form"
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                    </button>
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
                <div className="flex-1 overflow-y-auto px-3 pb-4 flex flex-col gap-1">
                    {filteredForms.map(form => {
                        const isActive = activeForm.id === form.id;
                        const formAccent = form.settings?.accentColor || '#4f46e5';
                        return (
                            <div
                                key={form.id}
                                onClick={() => { setActiveFormId(form.id); setIsPreviewMode(false); setActiveSubTab('questions'); setIsSidebarOpen(false); }}
                                className={`flex items-center gap-3 px-3.5 py-3 rounded-xl cursor-pointer transition-all duration-300 group ${
                                    isActive
                                        ? 'bg-white shadow-md shadow-gray-200/40 border border-gray-100 scale-[1.02]'
                                        : 'text-gray-600 hover:bg-white/50 border border-transparent'
                                }`}
                            >
                                {/* Color dot */}
                                <div className={`w-3 h-3 rounded-full shrink-0 transition-transform ${isActive ? 'scale-110 shadow-sm' : ''}`} style={{ backgroundColor: formAccent }} />
                                <span className={`flex-1 truncate text-[14px] ${isActive ? 'font-bold text-gray-900' : 'font-medium'}`}>
                                    {form.title}
                                </span>
                                {/* Actions */}
                                <div className={`flex items-center gap-0.5 transition-opacity duration-300 ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
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
                                className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors shadow-sm"
                            >
                                + Create New Form
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
                                        className="text-[15px] font-extrabold text-gray-900 truncate min-w-0 max-w-[100px] md:max-w-[150px] 2xl:max-w-[250px] tracking-tight bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-indigo-500/30 rounded hover:bg-gray-100 transition-colors px-2 py-1 -ml-2"
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
                        <button
                            onClick={() => setIsPreviewMode(!isPreviewMode)}
                            className={`flex items-center gap-2 px-3 md:px-4 py-2 rounded-xl text-[13px] font-bold border-2 transition-all duration-300 ${
                                isPreviewMode
                                    ? 'bg-gray-900 text-white border-gray-900 shadow-md scale-105'
                                    : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300 hover:shadow-sm'
                            }`}
                        >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                <circle cx="12" cy="12" r="3" />
                            </svg>
                            <span className="hidden 2xl:inline">Preview</span>
                        </button>

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
                <div className="flex-1 overflow-y-auto p-6 md:p-10 relative">
                    <div className="w-full max-w-3xl mx-auto animate-slide-up-fade">
                        {isPreviewMode ? (
                            <FormPreview form={activeForm} accentColor={accentColor} />
                        ) : activeSubTab === 'questions' ? (
                            <FormEditor
                                form={activeForm}
                                onUpdateForm={updateForm}
                                onUpdateField={handleUpdateField}
                                onDeleteField={handleDeleteField}
                                onDuplicateField={handleDuplicateField}
                                onAddField={handleAddField}
                                onReorderFields={handleReorderFields}
                                accentColor={accentColor}
                            />
                        ) : activeSubTab === 'responses' ? (
                            <FormResponses form={activeForm} />
                        ) : (
                            <FormSettings form={activeForm} onUpdateForm={updateForm} />
                        )}
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
        </div>
    );
};

export default FormsTab;
