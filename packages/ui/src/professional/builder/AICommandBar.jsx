import React, { useEffect, useRef, useState } from 'react';

const AICommandBar = ({ onGenerate }) => {
    const [prompt, setPrompt] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const timerRef = useRef(null);

    useEffect(() => {
        return () => {
            if (timerRef.current) {
                clearTimeout(timerRef.current);
            }
        };
    }, []);

    const handleGenerate = (event) => {
        event.preventDefault();
        const trimmedPrompt = prompt.trim();
        if (!trimmedPrompt || isGenerating) return;

        setIsGenerating(true);
        timerRef.current = setTimeout(() => {
            onGenerate?.(trimmedPrompt);
            setPrompt('');
            setIsGenerating(false);
            timerRef.current = null;
        }, 1500);
    };

    const isDisabled = isGenerating || !prompt.trim();
    const buttonClassName = isDisabled
        ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
        : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md hover:shadow-lg hover:-translate-y-0.5';

    return (
        <form
            onSubmit={handleGenerate}
            className="w-full bg-white/80 backdrop-blur-md border border-slate-200/80 rounded-xl shadow-lg flex items-center p-2 gap-3 transition-all focus-within:border-blue-400 focus-within:ring-4 focus-within:ring-blue-500/10 focus-within:shadow-xl"
        >
            <div className="pl-3 text-slate-400 shrink-0">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                    <path d="M12 8v4"></path>
                    <path d="M12 16h.01"></path>
                </svg>
            </div>
            <input
                type="text"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="Describe the workflow you want to build (e.g., 'Extract email intents and save to Postgres')..."
                className="flex-1 bg-transparent border-none outline-none text-slate-800 placeholder:text-slate-400 font-medium text-sm"
                disabled={isGenerating}
            />
            <button
                type="submit"
                disabled={isDisabled}
                className={`px-6 py-2 rounded-lg font-bold text-sm transition-all flex items-center gap-2 ${buttonClassName}`}
            >
                {isGenerating ? (
                    <>
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                        Generating...
                    </>
                ) : (
                    <>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 2v20"></path>
                            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                        </svg>
                        Generate
                    </>
                )}
            </button>
        </form>
    );
};

export default AICommandBar;
