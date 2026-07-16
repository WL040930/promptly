import React from 'react';
import Skeleton from '../../components/ui/Skeleton.jsx';

export default function WorkflowListSkeleton({ rows = 3 }) {
    return (
        <div className="grid grid-cols-1 gap-4" aria-busy="true" aria-label="Loading workflows">
            {Array.from({ length: rows }, (_, index) => (
                <div key={index} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between flex-wrap gap-4 min-h-[104px]">
                    <div className="flex items-center gap-5 min-w-0">
                        <Skeleton className="w-12 h-12 rounded-xl shrink-0" />
                        <div className="flex flex-col gap-2 min-w-0">
                            <Skeleton className="h-6 w-52 max-w-full rounded" />
                            <div className="flex items-center gap-3">
                                <Skeleton className="h-4 w-20 rounded" />
                                <Skeleton className="h-5 w-16 rounded" />
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <Skeleton className="h-9 w-24 rounded-lg" />
                        <Skeleton className="h-9 w-9 rounded-lg" />
                        <Skeleton className="h-9 w-9 rounded-lg" />
                    </div>
                </div>
            ))}
        </div>
    );
}
