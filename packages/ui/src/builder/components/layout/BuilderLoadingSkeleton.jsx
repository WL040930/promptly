import Skeleton from '../../../components/ui/Skeleton.jsx';
import ChatHistorySkeleton from '../../../components/chat/ChatHistorySkeleton.jsx';

function ToolbarSkeleton() {
    return (
        <div className="flex h-[4.25rem] w-full shrink-0 items-center gap-4 border-b border-slate-200/60 bg-white/90 px-4">
            <Skeleton className="h-8 w-8 rounded-lg" />
            <Skeleton className="h-8 w-32 rounded-lg" />
            <div className="ml-auto flex gap-2">
                <Skeleton className="h-8 w-24 rounded-lg" />
                <Skeleton className="h-8 w-24 rounded-lg" />
            </div>
        </div>
    );
}

function AILoadingSkeleton() {
    return (
        <div className="surface-grid flex h-full w-full flex-1 overflow-hidden font-sans" aria-busy="true" aria-label="Loading AI workflow editor">
            <main className="flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-white">
                <ToolbarSkeleton />
                <div className="flex min-h-0 flex-1 flex-col bg-white">
                    <div className="flex shrink-0 items-center justify-between border-b border-slate-200/70 bg-white/90 px-4 py-2.5">
                        <Skeleton className="h-3 w-24 rounded" />
                        <Skeleton className="h-7 w-32 rounded-lg" />
                    </div>
                    <div className="min-h-0 flex-1 overflow-hidden p-4">
                        <ChatHistorySkeleton />
                    </div>
                    <div className="shrink-0 border-t border-slate-200/70 bg-white/90 p-4">
                        <Skeleton className="h-14 w-full rounded-[24px]" />
                        <div className="mt-2 flex items-center justify-between gap-4 px-1">
                            <Skeleton className="h-3 w-36 rounded" />
                            <Skeleton className="h-3 w-28 rounded" />
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}

export default function BuilderLoadingSkeleton({ mode = 'canvas' }) {
    if (mode === 'ai') return <AILoadingSkeleton />;

    return (
        <div className="surface-grid flex h-full w-full flex-1 overflow-hidden font-sans" aria-busy="true" aria-label="Loading visual workflow editor">
            <aside className="w-72 bg-slate-50/90 border-r border-slate-200/60 flex flex-col h-full shrink-0">
                <div className="p-4 border-b border-slate-200 shrink-0">
                    <Skeleton className="h-4 w-24 rounded mb-4" />
                    <Skeleton className="h-10 w-full rounded-lg" />
                </div>
                <div className="flex-1 p-3 flex flex-col gap-4">
                    {Array.from({ length: 3 }, (_, index) => (
                        <div key={index} className="flex flex-col gap-2">
                            <Skeleton className="h-4 w-20 rounded" />
                            <Skeleton className="h-20 w-full rounded-r-xl" />
                        </div>
                    ))}
                </div>
            </aside>

            <main className="flex-1 flex flex-col h-full bg-slate-50/50 relative overflow-hidden">
                <ToolbarSkeleton />
                <div className="flex-1 relative">
                    <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(#94a3b8 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
                    <div className="absolute top-32 left-1/4 w-64 h-32 bg-white border border-slate-200 rounded-xl shadow-sm p-4 flex flex-col gap-3">
                        <Skeleton className="h-4 w-28 rounded" />
                        <Skeleton className="h-3 w-40 rounded" />
                    </div>
                    <div className="absolute top-64 left-1/2 w-64 h-32 bg-white border border-slate-200 rounded-xl shadow-sm p-4 flex flex-col gap-3">
                        <Skeleton className="h-4 w-32 rounded" />
                        <Skeleton className="h-3 w-44 rounded" />
                    </div>
                </div>
            </main>
        </div>
    );
}
