import React from 'react';
import { formatLastEdited } from '../utils/timeUtils.js';

/**
 * The top header toolbar for the workflow builder.
 * Shows: sidebar toggles, back button, breadcrumb, title editor,
 * status badge, "Test Run" / "Deploy" buttons, and "Last edit" timestamp.
 */
const BuilderToolbar = ({
    isLeftSidebarOpen,
    isRightSidebarOpen,
    onToggleLeft,
    onToggleRight,
    onBack,
    activeFolderName,
    activeWorkflow,
    isEditingTitle,
    titleInput,
    onTitleEditStart,
    onTitleInputChange,
    onTitleEditComplete,
    onTitleEditCancel,
    nodeCount,
    currentTime
}) => {
    return (
        <div className="flex flex-col shrink-0 z-10">
            {/* Main toolbar row */}
            <div className="w-full h-14 bg-white/80 backdrop-blur-md border-b border-slate-200/60 flex items-center justify-between px-4 shadow-sm gap-4">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                    {/* Left sidebar toggle */}
                    <button
                        onClick={onToggleLeft}
                        className={`shrink-0 p-1.5 rounded-lg border transition-colors ${
                            isLeftSidebarOpen
                                ? 'border-indigo-200 bg-indigo-50 text-indigo-600 hover:bg-indigo-100'
                                : 'border-slate-200 text-slate-500 hover:bg-slate-100'
                        }`}
                        title="Toggle Node Library"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line>
                        </svg>
                    </button>

                    {/* Back to Overview */}
                    <button
                        onClick={onBack}
                        className="shrink-0 p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 transition-colors"
                        title="Back to Workspace Overview"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline>
                        </svg>
                    </button>

                    {/* Breadcrumb + title */}
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                        <span className="text-slate-500 text-sm font-medium truncate hidden sm:block">{activeFolderName}</span>
                        <span className="text-slate-300 text-sm hidden sm:block">/</span>

                        {isEditingTitle ? (
                            <input
                                autoFocus
                                className="text-base font-semibold text-slate-900 bg-white border border-indigo-300 rounded px-1.5 py-0.5 outline-none focus:ring-2 focus:ring-indigo-500/20 w-48"
                                value={titleInput}
                                onChange={(e) => onTitleInputChange(e.target.value)}
                                onBlur={onTitleEditComplete}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') onTitleEditComplete();
                                    if (e.key === 'Escape') onTitleEditCancel();
                                }}
                            />
                        ) : (
                            <div
                                className="flex items-center gap-1.5 group cursor-pointer hover:bg-slate-100 rounded px-1.5 py-0.5 transition-colors"
                                onClick={onTitleEditStart}
                                title="Click to edit name"
                            >
                                <h2 className="text-base font-semibold text-slate-900 truncate">
                                    {activeWorkflow?.name || 'Untitled'}
                                </h2>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
                                </svg>
                            </div>
                        )}

                        <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded ml-2 ${
                            activeWorkflow?.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
                        }`}>
                            {activeWorkflow?.status || 'Draft'}
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                    <button className="ghost text-sm py-1.5 px-3.5 rounded-lg font-medium border-slate-200 shadow-sm hover:shadow whitespace-nowrap">Test Run</button>
                    <button className="solid text-sm py-1.5 px-4 rounded-lg shadow bg-indigo-600 text-white font-medium hover:bg-indigo-700 whitespace-nowrap">Deploy</button>

                    {/* Right sidebar toggle */}
                    <button
                        onClick={onToggleRight}
                        className={`shrink-0 p-1.5 rounded-lg border transition-colors ${
                            isRightSidebarOpen
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
