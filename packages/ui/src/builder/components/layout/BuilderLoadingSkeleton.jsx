import Skeleton from '../../../components/ui/Skeleton.jsx';

export default function BuilderLoadingSkeleton() {
    return (
        <div className="surface-grid flex h-full w-full flex-1 overflow-hidden font-sans">
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
                <div className="w-full h-14 bg-white/80 border-b border-slate-200/60 flex items-center px-4 shrink-0 gap-4">
                    <Skeleton className="h-8 w-8 rounded-lg" />
                    <Skeleton className="h-8 w-32 rounded-lg" />
                    <div className="ml-auto flex gap-2">
                        <Skeleton className="h-8 w-24 rounded-lg" />
                        <Skeleton className="h-8 w-24 rounded-lg" />
                    </div>
                </div>
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
