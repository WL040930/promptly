import React from 'react';

const FormEditorHeader = ({ form, onUpdateForm, accentColor = '#4f46e5' }) => {
    return (
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm relative transition-all duration-300">
            {/* Accent top gradient line */}
            <div className="h-3 w-full" style={{ background: `linear-gradient(90deg, ${accentColor}, ${accentColor}80)` }} />
            
            <div className="p-8 flex flex-col gap-3">
                <input
                    type="text"
                    value={form.title}
                    onChange={e => onUpdateForm({ title: e.target.value })}
                    placeholder="Form Title"
                    className="text-3xl font-extrabold text-gray-900 bg-transparent border-b-2 border-transparent hover:border-gray-200 focus:border-gray-400 focus:outline-none py-1.5 transition-all w-full placeholder:text-gray-400 tracking-tight"
                />
                <textarea
                    value={form.description || ''}
                    onChange={e => onUpdateForm({ description: e.target.value })}
                    placeholder="Add a description to explain the purpose of this form..."
                    rows={2}
                    className="text-[15px] font-medium text-gray-600 bg-transparent border-b-2 border-transparent hover:border-gray-200 focus:border-gray-400 focus:outline-none py-1.5 transition-all w-full resize-none leading-relaxed placeholder:text-gray-500"
                />
            </div>
        </div>
    );
};

export default FormEditorHeader;
