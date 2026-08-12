import {
    ArrowLeft,
    ChevronRight,
    Pause,
    Play,
    Rocket,
    Upload,
    History,
    Pencil,
    PanelLeft,
    Workflow,
    Sparkles,
    Layers,
    Clock
} from 'lucide-react';
import { ICON_MAP } from '../../utils/iconMap.jsx';
import RelativeTimeDisplay from '../../../components/ui/RelativeTimeDisplay.jsx';
import Button from '../../../components/ui/Button.jsx';

const BuilderToolbar = ({
    isLeftSidebarOpen,
    onToggleLeft,
    onBack,
    activeWorkflow,
    onTitleEditStart,
    nodeCount = 0,
    onTestRun,
    onProductionRun,
    isProductionReady = false,
    isRunning = false,
    onPublish,
    isPublishing = false,
    onPause,
    isPausing = false,
    onToggleHistory,
    isHistorySidebarOpen,
    viewMode = 'canvas',
    onViewModeChange
}) => {
    const isActive = activeWorkflow?.isActive || false;
    const hasDraftChanges = activeWorkflow?.release?.hasDraftChanges;
    const publishLabel = isActive && hasDraftChanges ? 'Publish changes' : isActive ? 'Resume' : 'Publish';

    return (
        <header className="relative z-20 flex h-[4.25rem] w-full shrink-0 items-center gap-3 border-b border-slate-200/80 bg-white/95 px-3 shadow-[0_2px_16px_rgba(15,23,42,0.04)] backdrop-blur-md select-none sm:px-4 lg:gap-5">
            {/* Identity rail: navigation, title, and small workflow context. */}
            <div className="flex min-w-0 flex-1 items-center gap-2 lg:min-w-[18rem]">
                <div className="flex shrink-0 items-center gap-0.5 rounded-xl border border-slate-200/80 bg-slate-50/80 p-0.5">
                    <Button
                        variant={isLeftSidebarOpen ? 'secondary' : 'ghost'}
                        size="icon-sm"
                        onClick={onToggleLeft}
                        title="Toggle node library"
                        className="shrink-0"
                    >
                        <PanelLeft className="h-4 w-4" />
                    </Button>
                    <button
                        type="button"
                        onClick={onBack}
                        title="Back to automations"
                        className="group flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-white hover:text-slate-900 sm:w-auto sm:gap-1 sm:px-2"
                    >
                        <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
                        <span className="hidden text-xs font-semibold sm:inline">Automations</span>
                    </button>
                </div>

                <ChevronRight className="hidden h-4 w-4 shrink-0 text-slate-300 sm:block" />

                <button
                    type="button"
                    onClick={onTitleEditStart}
                    title="Edit automation details"
                    className="group flex h-10 min-w-0 max-w-full items-center gap-2 rounded-xl border border-transparent px-1.5 text-left transition-colors hover:border-slate-200/80 hover:bg-slate-50"
                >
                    {activeWorkflow?.icon && ICON_MAP[activeWorkflow.icon] ? (
                        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl shadow-2xs ${activeWorkflow.iconBg || 'bg-indigo-100'} ${activeWorkflow.iconColor || 'text-indigo-600'}`}>
                            {ICON_MAP[activeWorkflow.icon]}
                        </div>
                    ) : (
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-indigo-100 bg-indigo-50 text-indigo-600 shadow-2xs">
                            <Workflow className="h-4 w-4" />
                        </div>
                    )}
                    <span className="min-w-0">
                        <span className="flex items-center gap-1.5">
                            <h1 className="max-w-[9rem] truncate text-sm font-bold tracking-tight text-slate-900 transition-colors group-hover:text-indigo-600 sm:max-w-[13rem] lg:max-w-[18rem]">
                                {activeWorkflow?.name || 'Untitled automation'}
                            </h1>
                            <Pencil className="hidden h-3 w-3 shrink-0 text-slate-400 transition-colors group-hover:text-indigo-500 sm:block" />
                        </span>
                        <span className="mt-0.5 hidden items-center gap-2 whitespace-nowrap text-[10px] font-semibold text-slate-400 xl:flex">
                            <span className="inline-flex items-center gap-1"><Layers className="h-3 w-3 text-indigo-400" />{nodeCount} step{nodeCount !== 1 ? 's' : ''}</span>
                            <span className="h-1 w-1 rounded-full bg-slate-300" />
                            <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3 text-slate-400" /><RelativeTimeDisplay timestamp={activeWorkflow?.updatedAt || activeWorkflow?.createdAt} /></span>
                        </span>
                    </span>
                </button>
            </div>

            {/* The editor mode stays visually centered and independent of the action rail. */}
            {onViewModeChange && (
                <div className="hidden shrink-0 items-center rounded-2xl border border-slate-200/80 bg-slate-100/80 p-1 shadow-2xs sm:flex">
                    <button
                        type="button"
                        aria-pressed={viewMode === 'canvas'}
                        onClick={() => onViewModeChange('canvas')}
                        className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${viewMode === 'canvas'
                            ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/70'
                            : 'text-slate-500 hover:text-slate-900'
                            }`}
                    >
                        <Workflow className="h-3.5 w-3.5 text-indigo-500" />
                        <span className="hidden xl:inline">Canvas</span>
                    </button>
                    <button
                        type="button"
                        aria-pressed={viewMode === 'ai'}
                        onClick={() => onViewModeChange('ai')}
                        className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${viewMode === 'ai'
                            ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-slate-200/70'
                            : 'text-slate-500 hover:text-slate-900'
                            }`}
                    >
                        <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                        <span className="hidden xl:inline">AI assistant</span>
                    </button>
                </div>
            )}

            {/* Action rail: a compact Run group, then a compact Release group. */}
            <div className="flex shrink-0 items-center gap-1.5 lg:gap-2">
                <div className="flex items-center gap-0.5 rounded-xl border border-slate-200/80 bg-slate-50/80 p-0.5">
                    <Button
                        variant="outline"
                        size="xs"
                        onClick={onTestRun}
                        disabled={isRunning}
                        isLoading={isRunning}
                        title="Run the draft in test mode"
                        loadingText={<span className="hidden md:inline">Testing…</span>}
                        iconLeft={!isRunning && <Play className="h-3.5 w-3.5 text-indigo-600 fill-indigo-600/20" />}
                        className="h-8 gap-0 rounded-lg border-transparent px-2 shadow-none hover:border-indigo-200 hover:bg-indigo-50/70 hover:text-indigo-700 sm:px-2.5 xl:gap-2"
                    >
                        <span className="hidden xl:inline">Test</span>
                    </Button>
                    <Button
                        variant={isProductionReady ? 'dangerSolid' : 'danger'}
                        size="xs"
                        onClick={onProductionRun}
                        disabled={isRunning}
                        aria-disabled={!isProductionReady}
                        title={isProductionReady ? 'Run the published automation with real side effects' : 'Publish and activate this automation before running it live'}
                        iconLeft={!isRunning && <Rocket className="h-3.5 w-3.5" />}
                        className="h-8 gap-0 rounded-lg px-2 sm:px-2.5 xl:gap-2"
                    >
                        <span className="hidden xl:inline">Live</span>
                    </Button>
                </div>

                <div className="flex items-center gap-0.5 rounded-xl border border-slate-200/80 bg-white p-0.5 shadow-2xs">
                    <Button
                        variant="primary"
                        size="xs"
                        onClick={onPublish}
                        disabled={isPublishing}
                        isLoading={isPublishing}
                        title={hasDraftChanges ? 'Publish draft changes for live runs' : 'Publish or resume the live release'}
                        loadingText={<span className="hidden xl:inline">Publishing…</span>}
                        iconLeft={!isPublishing && <Upload className="h-3.5 w-3.5" />}
                        className="h-8 gap-0 rounded-lg px-2 shadow-none sm:px-2.5 xl:gap-2"
                    >
                        <span className="hidden xl:inline">{publishLabel}</span>
                    </Button>
                    {isActive && <Button variant="ghost" size="xs" onClick={onPause} disabled={isPausing} isLoading={isPausing} title="Pause live triggers" iconLeft={!isPausing && <Pause className="h-3.5 w-3.5" />} className="h-8 gap-0 rounded-lg px-2 hover:bg-slate-100 sm:px-2.5 xl:gap-2"><span className="hidden xl:inline">Pause</span></Button>}
                </div>
                <span className={`hidden items-center gap-1.5 text-xs font-bold xl:flex ${isActive ? 'text-emerald-700' : hasDraftChanges ? 'text-amber-700' : 'text-slate-500'}`}><span className={`h-2 w-2 rounded-full ${isActive ? 'bg-emerald-500' : hasDraftChanges ? 'bg-amber-500' : 'bg-slate-400'}`} />{isActive ? (hasDraftChanges ? 'Changes not live' : 'Live') : 'Draft'}</span>

                <Button
                    variant={isHistorySidebarOpen ? 'secondary' : 'ghost'}
                    size="icon-sm"
                    onClick={onToggleHistory}
                    title="View version history"
                    className={`h-9 w-9 shrink-0 rounded-xl ${isHistorySidebarOpen ? 'border border-indigo-200/60 bg-indigo-50 text-indigo-600' : 'text-slate-600 hover:bg-slate-100 hover:text-indigo-600'}`}
                >
                    <History className="h-4 w-4" />
                </Button>
            </div>
        </header>
    );
};

export default BuilderToolbar;
