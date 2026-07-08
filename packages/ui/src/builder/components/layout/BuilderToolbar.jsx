import React from 'react';
import { formatLastEdited } from '../../utils/timeUtils.js';
import { ICON_MAP } from '../../utils/iconMap.jsx';

const BuilderToolbar = ({
    isLeftSidebarOpen,
    isRightSidebarOpen,
    onToggleLeft,
    onToggleRight,
    onBack,
    activeFolderName,
    activeWorkflow,
    onTitleEditStart,
    nodeCount,
    currentTime,
    onTestRun,
    isRunning = false,
    onSaveVersion,
    onToggleHistory,
    onToggleActive,
}) => {
    return (
        <div className="flex flex-col shrink-0 z-10">
            {/* Main toolbar row — 3-column grid: [left-icons | title | right-actions] */}
            <div className="w-full h-14 bg-white/80 backdrop-blur-md border-b border-slate-200/60 grid grid-cols-[auto_1fr_auto] items-center px-3 shadow-sm gap-2">

                {/* LEFT: sidebar toggles + back */}
                <div className="flex items-center gap-2 shrink-0">
                    <button
                        onClick={onToggleLeft}
                        className={`p-1.5 rounded-lg border transition-colors ${isLeftSidebarOpen
                                ? 'border-indigo-200 bg-indigo-50 text-indigo-600 hover:bg-indigo-100'
                                : 'border-slate-200 text-slate-500 hover:bg-slate-100'
                            }`}
                        title="Toggle Node Library"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line>
                        </svg>
                    </button>

                    <button
                        onClick={onBack}
                        className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 transition-colors"
                        title="Back to Workspace Overview"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline>
                        </svg>
                    </button>
                </div>

                {/* CENTER: breadcrumb + title — strictly contained, never overflows */}
                <div className="flex items-center gap-1.5 min-w-0 overflow-hidden px-1">
                    <span className="text-slate-400 text-sm font-medium truncate shrink-0 max-w-[100px] hidden sm:block">{activeFolderName}</span>
                    <span className="text-slate-300 text-sm shrink-0 hidden sm:block">/</span>

                    <button
                        className="flex items-center gap-1.5 group hover:bg-slate-100 rounded px-1.5 py-0.5 transition-colors min-w-0 overflow-hidden"
                        onClick={onTitleEditStart}
                        title="Click to edit name and icon"
                    >
                        {activeWorkflow?.icon && ICON_MAP[activeWorkflow.icon] && (
                            <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 ${activeWorkflow.iconBg} ${activeWorkflow.iconColor}`}>
                                {ICON_MAP[activeWorkflow.icon]}
                            </div>
                        )}
                        <h2 className="text-base font-semibold text-slate-900 truncate">
                            {activeWorkflow?.name || 'Untitled'}
                        </h2>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400 group-hover:text-indigo-500 transition-all shrink-0">
                            <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
                        </svg>
                    </button>

                    <span className="shrink-0 text-[10px] font-bold tracking-wide uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 hidden lg:block">
                        Saved
                    </span>
                </div>

                {/* RIGHT: actions — fixed, never shrinks */}
                <div className="flex items-center gap-2 shrink-0">
                    <button
                        onClick={onTestRun}
                        disabled={isRunning}
                        className={`ghost text-sm py-1.5 px-3 rounded-lg font-medium border border-slate-200 shadow-sm whitespace-nowrap flex items-center gap-1.5 transition-all ${
                            isRunning ? 'opacity-60 cursor-not-allowed' : 'hover:border-indigo-300 hover:text-indigo-600 hover:shadow'
                        }`}
                    >
                        {isRunning ? (
                            <>
                                <svg className="w-3.5 h-3.5 animate-spin text-indigo-500" viewBox="0 0 24 24" fill="none">
                                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.2" />
                                    <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                                </svg>
                                <span className="hidden sm:inline">Running…</span>
                            </>
                        ) : (
                            <>
                                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <polygon points="5 3 19 12 5 21 5 3" />
                                </svg>
                                <span className="hidden sm:inline">Test Run</span>
                            </>
                        )}
                    </button>

                    {/* Divider */}
                    <div className="w-px h-5 bg-slate-200 shrink-0"></div>

                    {/* Activation Toggle */}
                    <div className="flex items-center gap-1.5 shrink-0">
                        <button
                            onClick={onToggleActive}
                            className={`w-9 h-5 flex items-center p-0.5 rounded-full transition-colors duration-200 shrink-0 ${activeWorkflow?.isActive ? 'bg-green-500' : 'bg-slate-300'}`}
                            title={activeWorkflow?.isActive ? 'Deactivate workflow' : 'Activate workflow'}
                        >
                            <div className={`w-3 h-3 rounded-full bg-white shadow-sm transition-transform duration-200 ${activeWorkflow?.isActive ? 'translate-x-5' : 'translate-x-0'}`}></div>
                        </button>
                    </div>

                    <button
                        onClick={onSaveVersion}
                        className="solid text-sm py-1.5 px-4 rounded-lg font-medium whitespace-nowrap shrink-0"
                    >
                        Save Version
                    </button>

                    {/* History button */}
                    <button
                        onClick={onToggleHistory}
                        className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 transition-colors shrink-0"
                        title="View Version History"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10"></circle>
                            <polyline points="12 6 12 12 16 14"></polyline>
                        </svg>
                    </button>

                    {/* Right sidebar toggle */}
                    <button
                        onClick={onToggleRight}
                        className={`p-1.5 rounded-lg border transition-colors shrink-0 ${isRightSidebarOpen
                                ? 'border-indigo-200 bg-indigo-50 text-indigo-600 hover:bg-indigo-100'
                                : 'border-slate-200 text-slate-500 hover:bg-slate-100'
                            }`}
                        title="Toggle Promptly Agent / Inspector"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="15" y1="3" x2="15" y2="21"></line>
                        </svg>
                    </button>
                </div>
            </div>

            {/* Metadata sub-bar */}
            <div className="px-6 py-2 bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-500 flex items-center justify-between shrink-0">
                <span>Active nodes: {nodeCount}</span>
                <span>Last edit: {formatLastEdited(activeWorkflow?.updatedAt || activeWorkflow?.createdAt, currentTime)}</span>
            </div>
        </div>
    );
};

export default BuilderToolbar;
