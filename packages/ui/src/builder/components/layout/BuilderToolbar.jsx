import React from 'react';
import { ICON_MAP } from '../../utils/iconMap.jsx';
import Switch from '../../../components/ui/Switch.jsx';
import RelativeTimeDisplay from '../../../components/ui/RelativeTimeDisplay.jsx';
import Button from '../../../components/ui/Button.jsx';

const BuilderToolbar = ({
    isLeftSidebarOpen,
    isRightSidebarOpen,
    onToggleLeft,
    onToggleRight,
    onBack,
    activeFolderName,
    activeWorkflow,
    onTitleEditStart,
    nodeCount = 0,
    onTestRun,
    isRunning = false,
    isSavingVersion = false,
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
                    <Button
                        variant={isLeftSidebarOpen ? "secondary" : "ghost"}
                        size="icon-sm"
                        onClick={onToggleLeft}
                        title="Toggle Navigation Sidebar"
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                            <line x1="9" y1="3" x2="9" y2="21"></line>
                        </svg>
                    </Button>

                    <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={onBack}
                        title="Back to Workspace Overview"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline>
                        </svg>
                    </Button>
                </div>

                {/* CENTER: breadcrumb + title — strictly contained, never overflows */}
                <div className="flex items-center gap-1.5 min-w-0 overflow-hidden px-1">
                    <span className="text-slate-400 text-sm font-medium truncate shrink-0 max-w-[100px] hidden sm:block">{activeFolderName}</span>
                    <span className="text-slate-300 text-sm shrink-0 hidden sm:block">/</span>

                    <Button
                        variant="ghost"
                        className="group px-1.5 py-0.5 transition-colors min-w-0 overflow-hidden font-normal"
                        onClick={onTitleEditStart}
                        title="Click to edit name and icon"
                    >
                        <div className="flex items-center gap-1.5 min-w-0 overflow-hidden w-full">
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
                        </div>
                    </Button>

                    <span className="shrink-0 text-[10px] font-bold tracking-wide uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 hidden lg:block">
                        Saved
                    </span>
                </div>

                {/* RIGHT: actions — fixed, never shrinks */}
                <div className="flex items-center gap-2 shrink-0">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={onTestRun}
                        disabled={isRunning}
                        isLoading={isRunning}
                        loadingText={<span className="hidden sm:inline">Running…</span>}
                        iconLeft={
                            !isRunning && (
                                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <polygon points="5 3 19 12 5 21 5 3" />
                                </svg>
                            )
                        }
                    >
                        <span className="hidden sm:inline">Test Run</span>
                    </Button>

                    {/* Divider */}
                    <div className="w-px h-5 bg-slate-200 shrink-0"></div>

                    {/* Activation Toggle */}
                    <div className="flex items-center gap-1.5 shrink-0">
                        <Switch
                            size="md"
                            checked={activeWorkflow?.isActive || false}
                            onChange={onToggleActive}
                            title={activeWorkflow?.isActive ? 'Deactivate workflow' : 'Activate workflow'}
                        />
                    </div>

                    <Button
                        variant="primary"
                        size="sm"
                        onClick={onSaveVersion}
                        disabled={isSavingVersion}
                        isLoading={isSavingVersion}
                        loadingText="Saving…"
                    >
                        Save Version
                    </Button>

                    {/* History button */}
                    <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={onToggleHistory}
                        title="View Version History"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10"></circle>
                            <polyline points="12 6 12 12 16 14"></polyline>
                        </svg>
                    </Button>

                    {/* Right sidebar toggle */}
                    <Button
                        variant={isRightSidebarOpen ? "secondary" : "ghost"}
                        size="icon-sm"
                        onClick={onToggleRight}
                        title="Toggle Promptly Agent / Inspector"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="15" y1="3" x2="15" y2="21"></line>
                        </svg>
                    </Button>
                </div>
            </div>

            {/* Metadata sub-bar */}
            <div className="px-6 py-2 bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-500 flex items-center justify-between shrink-0">
                <span>Active nodes: {nodeCount}</span>
                <div className="flex items-center gap-1">
                    <span>Last edit:</span>
                    <span className="font-medium">
                        <RelativeTimeDisplay timestamp={activeWorkflow?.updatedAt || activeWorkflow?.createdAt} />
                    </span>
                </div>
            </div>
        </div>
    );
};

export default BuilderToolbar;
