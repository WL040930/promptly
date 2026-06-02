import React from 'react';

const TutorialStep = ({ selectedRole, tutorialStepIndex, onNext, onBack, onSubmit, isSubmitting, error }) => {
    const isChat = selectedRole === 'chat';

    const chatFeatures = [
        {
            title: "Zero-Code Automation",
            desc: "Simply chat with the Prompty Assistant to map out your automations effortlessly. No technical knowledge required.",
            tag: "Chat Interface"
        },
        {
            title: "Identify & Trigger",
            desc: "Tell the assistant what data sources to watch (emails, sheets) and how to trigger workflows securely.",
            tag: "Smart Triggers"
        },
        {
            title: "Format Outputs",
            desc: "Deliver your formatted results directly to Slack, Excel, or custom dashboards directly via chat commands.",
            tag: "Integrations"
        }
    ];

    const builderFeatures = [
        {
            title: "Visual Node Canvas",
            desc: "Connect Incoming Email triggers to AI Extractor nodes and external Actions seamlessly using our interactive drag-and-drop builder.",
            tag: "Drag & Drop"
        },
        {
            title: "AI Command Bar",
            desc: "Type a prompt to instantly generate complex node sequences and inject them directly into your workflow canvas.",
            tag: "AI Generation"
        },
        {
            title: "Test & Deploy",
            desc: "Run real-time test executions, view logs, and deploy your multi-step automations straight from the dashboard.",
            tag: "Execution"
        }
    ];

    const features = isChat ? chatFeatures : builderFeatures;
    const currentFeature = features[tutorialStepIndex - 1];
    const isLastStep = tutorialStepIndex === 3;

    return (
        <div className="w-full max-w-6xl flex flex-col items-center animate-fade-in z-10 h-full py-8">
            <div className="w-full flex-1 bg-white rounded-[2rem] p-8 md:p-12 shadow-2xl shadow-blue-900/5 border border-slate-100 mb-8 flex flex-col md:flex-row items-center gap-12 min-h-[500px]">
                
                {/* Left: Screenshot Placeholder */}
                <div className="flex-[1.2] w-full bg-slate-50 border-4 border-dashed border-slate-200 rounded-3xl flex flex-col items-center justify-center text-slate-400 h-full min-h-[350px] transition-all hover:bg-slate-100 group">
                    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mb-4 opacity-40 group-hover:scale-110 transition-transform duration-300"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
                    <span className="text-xl font-bold uppercase tracking-widest text-slate-400 mb-2">{currentFeature.title}</span>
                    <span className="text-sm font-medium text-slate-400">Replace with screenshot</span>
                </div>

                {/* Right: Text Content */}
                <div className="flex-1 flex flex-col items-start text-left py-4">
                    <div className="inline-flex px-4 py-1.5 rounded-full bg-blue-50 text-blue-600 text-sm font-bold uppercase tracking-widest border border-blue-100 mb-6 shadow-sm">
                        {currentFeature.tag}
                    </div>
                    <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight text-slate-900 mb-6 leading-tight">
                        {currentFeature.title}
                    </h2>
                    <p className="text-xl text-slate-600 leading-relaxed mb-8">
                        {currentFeature.desc}
                    </p>
                    
                    {/* Visual Progress Steps (Optional context indicator) */}
                    <div className="mt-auto flex gap-3 w-full max-w-[200px]">
                        {[1, 2, 3].map((step) => (
                            <div key={step} className={`h-1.5 flex-1 rounded-full transition-colors ${step <= tutorialStepIndex ? 'bg-blue-600' : 'bg-slate-200'}`}></div>
                        ))}
                    </div>
                </div>

            </div>

            {error && (
                <div className="mb-6 px-6 py-3 rounded-xl bg-red-50 border border-red-200 text-red-600 font-semibold text-sm max-w-lg z-10 flex items-center gap-2">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                    {error}
                </div>
            )}

            <div className="flex items-center gap-4 w-full max-w-md">
                <button
                    onClick={onBack}
                    disabled={isSubmitting}
                    className="px-6 py-4 rounded-xl text-lg font-bold text-slate-600 bg-white hover:bg-slate-50 border-2 border-slate-200 transition-colors w-1/3 text-center flex justify-center items-center shadow-sm"
                >
                    Back
                </button>
                {isLastStep ? (
                    <button
                        onClick={onSubmit}
                        disabled={isSubmitting}
                        className={`flex-1 px-8 py-4 rounded-xl text-lg font-bold transition-all duration-300 ${
                            !isSubmitting
                                ? 'bg-blue-600 text-white shadow-xl hover:bg-blue-700 hover:shadow-2xl hover:-translate-y-1 cursor-pointer'
                                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                        }`}
                    >
                        {isSubmitting ? 'Starting...' : 'Get Started'}
                    </button>
                ) : (
                    <button
                        onClick={onNext}
                        className="flex-1 px-8 py-4 rounded-xl text-lg font-bold bg-blue-600 text-white shadow-xl hover:bg-blue-700 hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 cursor-pointer text-center flex justify-center items-center"
                    >
                        Next Step
                    </button>
                )}
            </div>
        </div>
    );
};

export default TutorialStep;
