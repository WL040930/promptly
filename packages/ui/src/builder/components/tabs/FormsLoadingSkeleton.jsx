import React from 'react';
import Skeleton from '../../../components/ui/Skeleton.jsx';

export default function FormsLoadingSkeleton() {
    return (
        <div className="tab-content flex-1 flex overflow-hidden bg-[#f4f7f9] font-sans h-full">
            <aside className="hidden md:flex w-[280px] border-r border-gray-200/60 bg-white/95 flex-col shrink-0">
                <div className="p-4 flex items-center justify-between shrink-0">
                    <Skeleton className="h-5 w-20 rounded" />
                    <Skeleton className="h-9 w-9 rounded-xl" />
                </div>
                <div className="px-4 pb-3">
                    <Skeleton className="h-9 w-full rounded-xl" />
                </div>
                <div className="flex-1 px-3 pb-4 flex flex-col gap-2">
                    {Array.from({ length: 5 }, (_, index) => (
                        <div key={index} className="flex items-start gap-3 px-3.5 py-3.5 rounded-xl border border-transparent">
                            <Skeleton className="w-3 h-3 rounded-full mt-1" />
                            <div className="flex-1 flex flex-col gap-2">
                                <Skeleton className="h-4 w-3/4 rounded" />
                                <Skeleton className="h-3 w-1/2 rounded" />
                            </div>
                        </div>
                    ))}
                </div>
            </aside>

            <main className="flex-1 flex flex-col h-full overflow-hidden bg-transparent">
                <div className="h-16 bg-white/80 border-b border-gray-200/60 px-4 md:px-6 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-4">
                        <Skeleton className="h-5 w-36 rounded" />
                        <Skeleton className="h-8 w-40 rounded-lg" />
                    </div>
                    <Skeleton className="h-9 w-9 rounded-xl" />
                </div>
                <div className="flex-1 overflow-y-auto p-6 md:p-8">
                    <div className="max-w-3xl mx-auto flex flex-col gap-5">
                        <Skeleton className="h-8 w-56 rounded" />
                        <Skeleton className="h-4 w-80 max-w-full rounded" />
                        {Array.from({ length: 3 }, (_, index) => (
                            <div key={index} className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col gap-3">
                                <Skeleton className="h-5 w-48 rounded" />
                                <Skeleton className="h-4 w-full rounded" />
                                <Skeleton className="h-10 w-full rounded-lg" />
                            </div>
                        ))}
                    </div>
                </div>
            </main>
        </div>
    );
}
