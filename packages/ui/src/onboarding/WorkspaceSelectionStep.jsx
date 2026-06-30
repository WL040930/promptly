import React from 'react';

const WorkspaceSelectionStep = ({ selectedRole, onSelectRole, onNext }) => {
    return (
        <div className="w-full max-w-[840px] flex flex-col items-center animate-fade-in z-10">
            {/* Header */}
            <div className="mb-10 w-full max-w-2xl mx-auto text-center">
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-50 text-indigo-600 text-sm font-bold uppercase tracking-widest border border-indigo-100 mb-6 shadow-sm">
                    <img src="/logo.png" alt="Promptly Logo" className="w-5 h-5 object-contain rounded-md overflow-hidden" />
                    Welcome to Promptly
                </div>
                <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight text-slate-900 mb-4">
                    Choose Your Workspace
                </h2>
                <p className="text-lg text-slate-600 leading-relaxed">
                    Select the interface that best fits your workflow. You can always change this later in settings.
                </p>
            </div>

            {/* Option Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 w-full mb-10">
                {/* Chat Card */}
                <div
                    onClick={() => onSelectRole('chat')}
                    className={`group relative flex flex-col items-center text-center p-8 rounded-3xl cursor-pointer transition-all duration-300 border-2 ${
                        selectedRole === 'chat'
                            ? 'bg-white border-indigo-500 shadow-[0_15px_40px_rgba(59,130,246,0.15)] -translate-y-2'
                            : 'bg-white/80 border-slate-200 hover:bg-white hover:border-indigo-300 hover:shadow-xl hover:-translate-y-1'
                    }`}
                >
                    <div className={`w-20 h-20 rounded-2xl grid place-items-center mb-6 transition-colors duration-300 ${
                        selectedRole === 'chat' ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-500'
                    }`}>
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                        </svg>
                    </div>
                    <h3 className="text-2xl font-bold text-slate-900 mb-3">
                        Chat Mode
                    </h3>
                    <p className="text-slate-600 text-[0.95rem] leading-relaxed mb-4">
                        A streamlined conversational interface perfect for quick prompting and easy generation.
                    </p>
                    <div className="mt-auto px-3 py-1 bg-slate-100 text-slate-500 text-xs font-bold uppercase tracking-wider rounded-md">
                        Recommended for everyone
                    </div>
                </div>

                {/* Builder Card */}
                <div
                    onClick={() => onSelectRole('builder')}
                    className={`group relative flex flex-col items-center text-center p-8 rounded-3xl cursor-pointer transition-all duration-300 border-2 ${
                        selectedRole === 'builder'
                            ? 'bg-white border-indigo-500 shadow-[0_15px_40px_rgba(59,130,246,0.15)] -translate-y-2'
                            : 'bg-white/80 border-slate-200 hover:bg-white hover:border-indigo-300 hover:shadow-xl hover:-translate-y-1'
                    }`}
                >
                    <div className={`w-20 h-20 rounded-2xl grid place-items-center mb-6 transition-colors duration-300 ${
                        selectedRole === 'builder' ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-500'
                    }`}>
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="4 17 10 11 4 5"></polyline>
                            <line x1="12" y1="19" x2="20" y2="19"></line>
                        </svg>
                    </div>
                    <h3 className="text-2xl font-bold text-slate-900 mb-3">
                        Workflow Builder
                    </h3>
                    <p className="text-slate-600 text-[0.95rem] leading-relaxed mb-4">
                        Advanced node-based builder for complex prompt chaining and logic flow automation.
                    </p>
                    <div className="mt-auto px-3 py-1 bg-slate-100 text-slate-500 text-xs font-bold uppercase tracking-wider rounded-md">
                        Recommended for power users
                    </div>
                </div>
            </div>

            <button
                onClick={onNext}
                disabled={!selectedRole}
                className={`w-full max-w-sm px-8 py-4 rounded-xl text-lg font-bold transition-all duration-300 ${
                    selectedRole
                        ? 'bg-indigo-600 text-white shadow-xl hover:bg-indigo-700 hover:shadow-2xl hover:-translate-y-1 cursor-pointer'
                        : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                }`}
            >
                Continue to Tutorial
            </button>
        </div>
    );
};

export default WorkspaceSelectionStep;
