import React from 'react';

const labelClassName = 'text-xs font-bold text-slate-600 uppercase tracking-wide';
const inputClassName = 'w-full bg-slate-50 border border-slate-200 rounded-lg text-slate-800 px-3 py-2 outline-none text-sm font-medium focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 transition-all shadow-inner';
const sectionClassName = 'flex flex-col gap-1.5';

const PropertyInspector = ({ activeNode }) => {
    if (!activeNode) {
        return (
            <div className="h-full p-6 flex flex-col items-center justify-center text-center">
                <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-300 mb-4 shadow-inner">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="3"></circle>
                        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                    </svg>
                </div>
                <h3 className="text-sm font-bold text-slate-800">No Node Selected</h3>
                <p className="text-xs text-slate-500 mt-2">Select a node on the canvas to configure its properties.</p>
            </div>
        );
    }

    return (
        <div
            key={activeNode.id}
            className="flex flex-col h-full w-full"
        >
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <h3 className="font-bold text-slate-900 text-sm">Node Configuration</h3>
                <span className="text-[0.65rem] font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                    {activeNode.type}
                </span>
            </div>

            <div className="p-4 flex-1 overflow-y-auto flex flex-col gap-5">
                <div className={sectionClassName}>
                    <label className={labelClassName}>Node Name</label>
                    <input
                        type="text"
                        defaultValue={activeNode.title}
                        className={inputClassName}
                    />
                </div>

                <div className={sectionClassName}>
                    <label className={labelClassName}>Description</label>
                    <textarea
                        defaultValue={activeNode.description}
                        rows="2"
                        className={`${inputClassName} resize-none`}
                    />
                </div>

                <div className="w-full h-px bg-slate-100 my-2"></div>

                {activeNode.type === 'ai' && (
                    <div className="flex flex-col gap-3">
                        <div className={sectionClassName}>
                            <label className={`${labelClassName} flex justify-between`}>
                                Prompt Template
                                <span className="text-blue-500 cursor-pointer hover:underline">Variables</span>
                            </label>
                            <textarea
                                defaultValue="Extract the main intent and urgency from the following email: {{email_body}}"
                                rows="4"
                                className="w-full bg-slate-900 border border-slate-800 rounded-lg text-blue-100 px-3 py-3 outline-none font-mono text-xs focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all shadow-inner resize-none leading-relaxed"
                            />
                        </div>
                        <div className={sectionClassName}>
                            <label className={labelClassName}>Model Selection</label>
                            <select className={`${inputClassName} appearance-none cursor-pointer`}>
                                <option>prompty-ultra-v3</option>
                                <option>prompty-fast-v3</option>
                            </select>
                        </div>
                    </div>
                )}

                {activeNode.type === 'trigger' && (
                    <div className="flex flex-col gap-3">
                        <div className={sectionClassName}>
                            <label className={labelClassName}>Webhook URL</label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    readOnly
                                    value="https://api.prompty.com/v1/wh/9a8b7"
                                    className="flex-1 bg-slate-50 border border-slate-200 rounded-lg text-slate-500 px-3 py-2 outline-none font-mono text-[0.7rem] shadow-inner"
                                />
                                <button className="bg-slate-100 text-slate-600 px-3 rounded-lg border border-slate-200 hover:bg-slate-200 font-bold text-xs transition-colors">
                                    Copy
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {activeNode.type === 'action' && (
                    <div className="flex flex-col gap-3">
                        <div className={sectionClassName}>
                            <label className={labelClassName}>Connection</label>
                            <div className="flex items-center gap-2 p-2 bg-emerald-50 border border-emerald-100 rounded-lg">
                                <div className="w-6 h-6 rounded bg-white flex items-center justify-center text-emerald-600 shadow-sm border border-emerald-100">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path></svg>
                                </div>
                                <span className="text-sm font-bold text-emerald-800">Production DB</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50/50">
                <button className="w-full py-2 bg-white border border-slate-200 rounded-lg text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50 hover:border-slate-300 transition-all">
                    Test Node
                </button>
            </div>
        </div>
    );
};

export default PropertyInspector;
