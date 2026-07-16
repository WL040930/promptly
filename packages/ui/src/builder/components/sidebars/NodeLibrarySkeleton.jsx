import React from 'react';
import Skeleton from '../../../components/ui/Skeleton.jsx';

export default function NodeLibrarySkeleton() {
    return (
        <>
            {Array.from({ length: 3 }, (_, sectionIndex) => (
                <div key={sectionIndex} className="flex flex-col gap-3 mb-5 last:mb-0">
                    <Skeleton className="h-5 w-32 rounded" />
                    <div className="flex flex-col gap-2">
                        {Array.from({ length: 2 }, (_, itemIndex) => (
                            <div key={itemIndex} className="bg-white p-3 rounded-xl border border-slate-200 flex items-start gap-3">
                                <Skeleton className="w-8 h-8 rounded-lg" />
                                <div className="flex flex-col gap-2 flex-1">
                                    <div className="flex items-center justify-between gap-2">
                                        <Skeleton className="h-4 w-24 rounded" />
                                        <Skeleton className="h-3 w-10 rounded" />
                                    </div>
                                    <Skeleton className="h-3 w-full rounded" />
                                    <Skeleton className="h-3 w-3/4 rounded" />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </>
    );
}
