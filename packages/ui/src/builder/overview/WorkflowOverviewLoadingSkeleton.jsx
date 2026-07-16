import React from 'react';
import Skeleton from '../../components/ui/Skeleton.jsx';

const OverviewStatSkeleton = () => (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <Skeleton className="h-1 w-full rounded-none" />
        <div className="p-5">
            <div className="flex items-center justify-between mb-4">
                <Skeleton className="h-3 w-28 rounded" />
                <Skeleton className="w-8 h-8 rounded-lg" />
            </div>
            <div className="flex items-baseline gap-2.5">
                <Skeleton className="h-9 w-16 rounded" />
                <Skeleton className="h-3 w-20 rounded" />
            </div>
        </div>
    </div>
);

const FolderTreeRowSkeleton = ({ workflow = false, indented = false }) => (
    <div className={`flex items-center gap-2.5 px-2 py-1.5 ${indented ? 'ml-8' : ''}`}>
        <Skeleton className={`${workflow ? 'w-7 h-7 rounded-lg' : 'w-4 h-4 rounded'} shrink-0`} />
        <div className="flex flex-col gap-1 flex-1 min-w-0">
            <Skeleton className={`${workflow ? 'h-3.5 w-44' : 'h-4 w-36'} rounded`} />
            {workflow && <Skeleton className="h-2.5 w-32 rounded" />}
        </div>
        {!workflow && <Skeleton className="h-3 w-14 rounded" />}
        {workflow && <Skeleton className="w-16 h-6 rounded-md" />}
    </div>
);

const WorkflowOverviewLoadingSkeleton = () => (
    <div className="tab-content flex-1 overflow-y-auto bg-slate-50 font-sans relative p-6 md:p-8">
        <div className="max-w-6xl mx-auto flex flex-col gap-8">
            <div className="flex items-center justify-between gap-6">
                <div className="flex flex-col gap-2">
                    <Skeleton className="h-8 w-32 rounded" />
                    <Skeleton className="h-4 w-72 rounded" />
                </div>
                <Skeleton className="h-10 w-40 rounded-lg shrink-0" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <OverviewStatSkeleton />
                <OverviewStatSkeleton />
                <OverviewStatSkeleton />
            </div>

            <div className="flex flex-col gap-3 mt-2">
                <div className="flex items-center justify-between gap-4">
                    <Skeleton className="h-10 w-72 rounded-xl" />
                    <Skeleton className="h-10 w-32 rounded-lg shrink-0" />
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col p-2 gap-0.5 min-h-52">
                    <FolderTreeRowSkeleton />
                    <FolderTreeRowSkeleton workflow indented />
                    <FolderTreeRowSkeleton workflow indented />
                    <FolderTreeRowSkeleton />
                    <FolderTreeRowSkeleton workflow indented />
                </div>
            </div>
        </div>
    </div>
);

export default WorkflowOverviewLoadingSkeleton;
