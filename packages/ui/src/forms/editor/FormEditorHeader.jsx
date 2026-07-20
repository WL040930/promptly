
const FormEditorHeader = ({ form, onUpdateForm, accentColor = '#5b4ee8' }) => {
    return (
        <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_14px_30px_rgba(23,24,39,0.05)] transition-all duration-300">
            {/* Accent top gradient line */}
            <div className="h-3 w-full" style={{ background: `linear-gradient(90deg, ${accentColor}, ${accentColor}80)` }} />
            
            <div className="flex flex-col gap-3 p-6 sm:p-8">
                <span className="eyebrow">Form identity</span>
                <input
                    type="text"
                    value={form.title}
                    onChange={e => onUpdateForm({ title: e.target.value })}
                    placeholder="Form Title"
                    className="text-3xl font-extrabold text-gray-900 bg-transparent border-b-2 border-transparent hover:border-gray-200 focus:border-gray-400 focus:outline-none py-1.5 transition-all w-full placeholder:text-gray-400 tracking-tight"
                    aria-label="Form title"
                />
                <textarea
                    value={form.description || ''}
                    onChange={e => onUpdateForm({ description: e.target.value })}
                    placeholder="Add a description to explain the purpose of this form..."
                    rows={2}
                    className="text-[15px] font-medium text-gray-600 bg-transparent border-b-2 border-transparent hover:border-gray-200 focus:border-gray-400 focus:outline-none py-1.5 transition-all w-full resize-none leading-relaxed placeholder:text-gray-500"
                    aria-label="Form description"
                />
            </div>
        </div>
    );
};

export default FormEditorHeader;
