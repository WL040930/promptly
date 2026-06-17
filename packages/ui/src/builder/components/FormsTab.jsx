import React, { useState } from 'react';

const INITIAL_FORMS = [
    {
        id: 'form_1',
        title: 'Customer Feedback Survey',
        description: 'Collect feedback from customers regarding their onboarding experience.',
        fields: [
            { id: 'f_1', label: 'Full Name', type: 'text', required: true },
            { id: 'f_2', label: 'Onboarding Rating', type: 'select', choices: ['Excellent', 'Good', 'Average', 'Poor'], required: true },
            { id: 'f_3', label: 'Any specific suggestions?', type: 'textarea', required: false }
        ]
    },
    {
        id: 'form_2',
        title: 'Support Request Intake',
        description: 'Ticket collection form for customer support inquiries.',
        fields: [
            { id: 'f_4', label: 'Email Address', type: 'email', required: true },
            { id: 'f_5', label: 'Urgency Level', type: 'select', choices: ['High', 'Medium', 'Low'], required: true },
            { id: 'f_6', label: 'Issue Description', type: 'textarea', required: true }
        ]
    }
];

const FormsTab = () => {
    const [forms, setForms] = useState(INITIAL_FORMS);
    const [activeFormId, setActiveFormId] = useState('form_1');
    const [isPreviewMode, setIsPreviewMode] = useState(false);

    const activeForm = forms.find(f => f.id === activeFormId) || forms[0];

    const updateForm = (updatedFields) => {
        setForms(prev => prev.map(f => {
            if (f.id === activeForm.id) {
                return { ...f, ...updatedFields };
            }
            return f;
        }));
    };

    const handleCreateForm = () => {
        const newFormId = `form_${Date.now()}`;
        const newForm = {
            id: newFormId,
            title: 'Untitled Form',
            description: 'Provide a description for this form.',
            fields: [
                { id: `f_${Date.now()}`, label: 'Question 1', type: 'text', required: false }
            ]
        };
        setForms(prev => [...prev, newForm]);
        setActiveFormId(newFormId);
        setIsPreviewMode(false);
    };

    const handleDeleteForm = (e, formId) => {
        e.stopPropagation();
        if (forms.length === 1) {
            alert('Cannot delete the last form.');
            return;
        }
        setForms(prev => prev.filter(f => f.id !== formId));
        if (activeFormId === formId) {
            const remaining = forms.filter(f => f.id !== formId);
            setActiveFormId(remaining[0].id);
        }
    };

    const handleAddField = () => {
        const newField = {
            id: `f_${Date.now()}`,
            label: 'New Question',
            type: 'text',
            required: false,
            choices: ['Option 1', 'Option 2']
        };
        updateForm({
            fields: [...activeForm.fields, newField]
        });
    };

    const handleUpdateField = (fieldId, updatedProperties) => {
        updateForm({
            fields: activeForm.fields.map(field => {
                if (field.id === fieldId) {
                    return { ...field, ...updatedProperties };
                }
                return field;
            })
        });
    };

    const handleDeleteField = (fieldId) => {
        updateForm({
            fields: activeForm.fields.filter(field => field.id !== fieldId)
        });
    };

    const handleAddChoice = (fieldId, choices) => {
        const nextChoices = [...choices, `Option ${choices.length + 1}`];
        handleUpdateField(fieldId, { choices: nextChoices });
    };

    const handleUpdateChoice = (fieldId, choices, index, value) => {
        const nextChoices = [...choices];
        nextChoices[index] = value;
        handleUpdateField(fieldId, { choices: nextChoices });
    };

    const handleDeleteChoice = (fieldId, choices, index) => {
        const nextChoices = choices.filter((_, idx) => idx !== index);
        handleUpdateField(fieldId, { choices: nextChoices });
    };

    return (
        <div className="flex-1 flex overflow-hidden bg-slate-50 font-sans animate-fade-in h-full">
            
            {/* Left Sidebar: Forms List */}
            <aside className="w-64 border-r border-slate-200 bg-white flex flex-col shrink-0">
                <div className="p-4 border-b border-slate-100 flex items-center justify-between shrink-0">
                    <h3 className="font-extrabold text-slate-800 text-sm">Your Forms</h3>
                    <button 
                        onClick={handleCreateForm}
                        className="p-1 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors"
                        title="Create New Form"
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-2.5 flex flex-col gap-1">
                    {forms.map(form => (
                        <div
                            key={form.id}
                            onClick={() => { setActiveFormId(form.id); setIsPreviewMode(false); }}
                            className={`flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-colors group ${
                                activeForm.id === form.id 
                                    ? 'bg-blue-50 border border-blue-100 text-blue-700 font-bold'
                                    : 'hover:bg-slate-50 text-slate-650 border border-transparent font-bold'
                            }`}
                        >
                            <span className="truncate text-xs sm:text-sm">{form.title}</span>
                            <button 
                                onClick={(e) => handleDeleteForm(e, form.id)}
                                className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-opacity p-0.5"
                                title="Delete Form"
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                            </button>
                        </div>
                    ))}
                </div>
            </aside>

            {/* Main Content Area */}
            <main className="flex-1 flex flex-col h-full overflow-hidden">
                {/* Topbar: Action controls */}
                <div className="h-14 bg-white border-b border-slate-200 px-6 flex items-center justify-between shrink-0">
                    <h2 className="text-sm sm:text-base font-extrabold text-slate-800 truncate">{activeForm.title}</h2>
                    
                    <div className="flex gap-2">
                        <button
                            onClick={() => setIsPreviewMode(!isPreviewMode)}
                            className={`px-3 py-1.5 rounded-lg border text-xs sm:text-sm font-bold transition-all shadow-sm flex items-center gap-1.5 ${
                                isPreviewMode 
                                    ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-750' 
                                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                            }`}
                        >
                            {isPreviewMode ? (
                                <>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                    Edit Form
                                </>
                            ) : (
                                <>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                                    Live Preview
                                </>
                            )}
                        </button>
                    </div>
                </div>

                {/* Form Body Container */}
                <div className="flex-1 overflow-y-auto p-6 md:p-8 flex flex-col items-center">
                    <div className="w-full max-w-3xl flex flex-col gap-8">
                        
                        {/* 1. VIEW MODE: Visual Form Preview */}
                        {isPreviewMode ? (
                            <div className="flex flex-col gap-4 bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
                                <div className="border-b border-slate-100 pb-4 mb-2">
                                    <h1 className="text-2xl font-extrabold text-slate-900">{activeForm.title}</h1>
                                    <p className="text-slate-500 font-medium text-xs sm:text-sm mt-1.5 leading-relaxed">{activeForm.description}</p>
                                </div>
                                <form className="flex flex-col gap-5" onSubmit={(e) => { e.preventDefault(); alert('Mock Form Submitted!'); }}>
                                    {activeForm.fields.map(field => (
                                        <div key={field.id} className="flex flex-col gap-1.5">
                                            <label className="text-xs sm:text-sm font-bold text-slate-700">
                                                {field.label} {field.required && <span className="text-red-500">*</span>}
                                            </label>
                                            
                                            {field.type === 'textarea' ? (
                                                <textarea 
                                                    rows="3" 
                                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs sm:text-sm font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10 transition-all shadow-inner"
                                                    placeholder="Your answer"
                                                />
                                            ) : field.type === 'select' ? (
                                                <select className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-bold text-slate-700 focus:outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10 transition-all cursor-pointer shadow-inner">
                                                    {(field.choices || []).map((choice, idx) => (
                                                        <option key={idx} value={choice}>{choice}</option>
                                                    ))}
                                                </select>
                                            ) : (
                                                <input 
                                                    type={field.type} 
                                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs sm:text-sm font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10 transition-all shadow-inner"
                                                    placeholder="Your answer"
                                                />
                                            )}
                                        </div>
                                    ))}
                                    <button type="submit" className="mt-2 w-full bg-blue-600 hover:bg-blue-750 text-white font-bold text-xs sm:text-sm py-2.5 rounded-xl shadow-md shadow-blue-500/10 transition-all">
                                        Submit
                                    </button>
                                </form>
                            </div>
                        ) : (
                            
                            /* 2. DESIGN MODE: Question Cards Builder */
                            <div className="flex flex-col gap-5 pb-10">
                                {/* Header Details Card */}
                                <div className="bg-white border-t-8 border-t-blue-600 border border-slate-200 rounded-3xl p-6 shadow-sm flex flex-col gap-3">
                                    <input 
                                        type="text" 
                                        value={activeForm.title} 
                                        onChange={(e) => updateForm({ title: e.target.value })}
                                        placeholder="Form Title"
                                        className="text-xl sm:text-2xl font-extrabold text-slate-900 border-b border-transparent hover:border-slate-100 focus:border-blue-400 focus:outline-none py-1 transition-all"
                                    />
                                    <textarea 
                                        value={activeForm.description} 
                                        onChange={(e) => updateForm({ description: e.target.value })}
                                        placeholder="Form Description"
                                        rows="2"
                                        className="text-xs sm:text-sm font-medium text-slate-500 border-b border-transparent hover:border-slate-100 focus:border-blue-400 focus:outline-none py-1 transition-all resize-none leading-relaxed"
                                    />
                                </div>

                                {/* Form Fields List */}
                                {activeForm.fields.map(field => (
                                    <div key={field.id} className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm flex flex-col gap-4 relative group">
                                        {/* Field header inputs */}
                                        <div className="flex gap-4 flex-wrap">
                                            <input 
                                                type="text"
                                                value={field.label}
                                                onChange={(e) => handleUpdateField(field.id, { label: e.target.value })}
                                                placeholder="Question Text"
                                                className="flex-1 min-w-[200px] text-xs sm:text-sm font-extrabold text-slate-800 border-b border-slate-100 focus:border-blue-400 focus:outline-none py-1.5 transition-all"
                                            />
                                            <select 
                                                value={field.type}
                                                onChange={(e) => handleUpdateField(field.id, { type: e.target.value })}
                                                className="bg-slate-50 border border-slate-200 rounded-lg text-slate-700 text-xs sm:text-sm font-bold px-2.5 py-1.5 focus:outline-none cursor-pointer"
                                            >
                                                <option value="text">Text Input</option>
                                                <option value="email">Email</option>
                                                <option value="select">Dropdown Choice</option>
                                                <option value="textarea">Paragraph text</option>
                                            </select>
                                        </div>

                                        {/* Choices builder (shown for choice type select) */}
                                        {field.type === 'select' && (
                                            <div className="flex flex-col gap-2 pl-4 border-l-2 border-slate-100 mt-1">
                                                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Choices Options</span>
                                                {(field.choices || []).map((choice, index) => (
                                                    <div key={index} className="flex items-center gap-2">
                                                        <div className="w-1.5 h-1.5 rounded-full bg-slate-300 shrink-0"></div>
                                                        <input 
                                                            type="text" 
                                                            value={choice}
                                                            onChange={(e) => handleUpdateChoice(field.id, field.choices, index, e.target.value)}
                                                            className="flex-1 text-xs sm:text-sm font-bold text-slate-750 text-slate-700 border-b border-transparent hover:border-slate-100 focus:border-blue-400 focus:outline-none py-0.5 transition-all"
                                                        />
                                                        {(field.choices || []).length > 1 && (
                                                            <button 
                                                                onClick={() => handleDeleteChoice(field.id, field.choices, index)}
                                                                className="text-slate-300 hover:text-red-500 p-0.5"
                                                                title="Delete Option"
                                                            >
                                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                                            </button>
                                                        )}
                                                    </div>
                                                ))}
                                                <button 
                                                    onClick={() => handleAddChoice(field.id, field.choices || [])}
                                                    className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 mt-1.5 self-start"
                                                >
                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                                                    Add Option
                                                </button>
                                            </div>
                                        )}

                                        {/* Actions footer (Required toggle and Delete) */}
                                        <div className="flex items-center justify-between border-t border-slate-100 pt-3 mt-1">
                                            <div className="flex items-center gap-2">
                                                <input 
                                                    type="checkbox" 
                                                    id={`req-${field.id}`}
                                                    checked={field.required || false}
                                                    onChange={(e) => handleUpdateField(field.id, { required: e.target.checked })}
                                                    className="w-3.5 h-3.5 text-blue-600 rounded border-slate-350 focus:ring-blue-500/20 cursor-pointer"
                                                />
                                                <label htmlFor={`req-${field.id}`} className="text-xs sm:text-sm font-bold text-slate-500 cursor-pointer select-none">
                                                    Required field
                                                </label>
                                            </div>
                                            <button 
                                                onClick={() => handleDeleteField(field.id)}
                                                className="text-slate-400 hover:text-red-650 p-1.5 hover:bg-slate-50 rounded-lg transition-colors"
                                                title="Delete Question"
                                            >
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                            </button>
                                        </div>
                                    </div>
                                ))}

                                {/* Add Question Button */}
                                <button 
                                    onClick={handleAddField}
                                    className="bg-white border-2 border-dashed border-slate-200 hover:border-blue-400 rounded-3xl p-4 text-center text-xs sm:text-sm font-bold text-slate-500 hover:text-blue-650 flex items-center justify-center gap-1.5 transition-all shadow-sm hover:shadow"
                                >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                                    Add Question
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
};

export default FormsTab;
