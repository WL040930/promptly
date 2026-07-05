import React, { useState } from 'react';

const labelClassName = 'text-xs font-semibold text-slate-500';
const inputClassName = 'w-full bg-slate-50 border border-slate-200 rounded-lg text-slate-800 px-3 py-2 outline-none text-sm font-medium focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 transition-all shadow-inner';
const sectionClassName = 'flex flex-col gap-1.5';

const PropertyInspector = ({ activeNode, onUpdateNode }) => {
    if (!activeNode) {
        return (
            <div className="h-full p-6 flex flex-col items-center justify-center text-center">
                <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-300 mb-4 shadow-inner">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="3"></circle>
                        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                    </svg>
                </div>
                <h3 className="text-sm font-semibold text-slate-800">No Node Selected</h3>
                <p className="text-xs text-slate-500 mt-2">Select a node on the canvas to configure its properties.</p>
            </div>
        );
    }

    const [title, setTitle] = useState(activeNode.title || '');
    const [description, setDescription] = useState(activeNode.description || '');

    const handleTitleChange = (e) => {
        const val = e.target.value;
        setTitle(val);
        onUpdateNode?.(activeNode.id, { title: val });
    };

    const handleDescriptionChange = (e) => {
        const val = e.target.value;
        setDescription(val);
        onUpdateNode?.(activeNode.id, { description: val });
    };

    return (
        <div
            key={activeNode.id}
            className="flex flex-col h-full w-full"
        >
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <h3 className="font-semibold text-slate-900 text-sm">Node Configuration</h3>
                <span className="text-xs font-semibold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                    {activeNode.type}
                </span>
            </div>

            <div className="p-4 flex-1 overflow-y-auto flex flex-col gap-5">
                <div className={sectionClassName}>
                    <label className={labelClassName}>Node Name</label>
                    <input
                        type="text"
                        value={title}
                        onChange={handleTitleChange}
                        className={inputClassName}
                    />
                </div>

                <div className={sectionClassName}>
                    <label className={labelClassName}>Description</label>
                    <textarea
                        value={description}
                        onChange={handleDescriptionChange}
                        rows="2"
                        className={`${inputClassName} resize-none`}
                    />
                </div>

                <div className="w-full h-px bg-slate-100 my-2"></div>

                {/* Dynamic Configuration Driven by schema.json */}
                {(() => {
                    const configInputs = activeNode.schema?.inputs?.filter(input => !input.isConnection) || [];
                    
                    if (configInputs.length > 0) {
                        return (
                            <div className="flex flex-col gap-4">
                                {configInputs.map((input) => {
                                    const value = activeNode.config?.[input.name] !== undefined 
                                                ? activeNode.config[input.name] 
                                                : (input.defaultValue !== undefined ? input.defaultValue : '');
                                                
                                    const handleChange = (e) => {
                                        let val = e.target.value;
                                        if (input.type === 'boolean') {
                                            val = e.target.checked;
                                        } else if (input.type === 'number') {
                                            val = Number(val);
                                        }
                                        onUpdateNode?.(activeNode.id, { 
                                            config: { ...(activeNode.config || {}), [input.name]: val } 
                                        });
                                    };

                                    return (
                                        <div key={input.name} className={sectionClassName}>
                                            {input.type !== 'boolean' && (
                                                <label className={labelClassName}>{input.label || input.name}</label>
                                            )}
                                            
                                            {input.type === 'textarea' ? (
                                                <textarea
                                                    value={value}
                                                    onChange={handleChange}
                                                    placeholder={input.placeholder}
                                                    rows="4"
                                                    className={`${inputClassName} resize-none`}
                                                />
                                            ) : input.type === 'select' ? (
                                                <div className="relative">
                                                    <select 
                                                        value={value}
                                                        onChange={handleChange}
                                                        className={`${inputClassName} appearance-none cursor-pointer pr-8`}
                                                    >
                                                        {input.options?.map(opt => (
                                                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                        ))}
                                                    </select>
                                                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-400">
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                                                            <polyline points="6 9 12 15 18 9"></polyline>
                                                        </svg>
                                                    </div>
                                                </div>
                                            ) : input.type === 'boolean' ? (
                                                <label className="flex items-center gap-2 cursor-pointer mt-1">
                                                    <input 
                                                        type="checkbox" 
                                                        checked={!!value} 
                                                        onChange={handleChange}
                                                        className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300"
                                                    />
                                                    <span className="text-sm font-semibold text-slate-700">{input.label || input.name}</span>
                                                </label>
                                            ) : (
                                                <input
                                                    type={input.type === 'number' ? 'number' : 'text'}
                                                    value={value}
                                                    onChange={handleChange}
                                                    placeholder={input.placeholder}
                                                    className={inputClassName}
                                                />
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        );
                    } else {
                        return (
                            <div className="text-xs text-slate-400 italic text-center py-4 bg-slate-50 rounded-lg">
                                This node has no configurable properties.
                            </div>
                        );
                    }
                })()}
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50/50">
                <button className="w-full py-2 bg-white border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 hover:border-slate-300 transition-all">
                    Test Node
                </button>
            </div>
        </div>
    );
};

export default PropertyInspector;
