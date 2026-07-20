import Skeleton from '../../components/ui/Skeleton.jsx';

export default function FormResponsesSkeleton() {
    return (
        <div className="flex flex-col gap-6 pb-16" aria-busy="true" aria-label="Loading responses">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-5">
                {Array.from({ length: 3 }, (_, index) => (
                    <div key={index} className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_12px_28px_rgba(23,24,39,0.04)]">
                        <Skeleton className="h-9 w-20 rounded" />
                        <Skeleton className="h-3 w-32 rounded" />
                    </div>
                ))}
            </div>
            <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_12px_28px_rgba(23,24,39,0.04)]">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 bg-gray-50/50 px-5 py-4 sm:px-6 sm:py-5">
                    <Skeleton className="h-6 w-36 rounded" />
                    <Skeleton className="h-9 w-28 rounded-xl" />
                </div>
                <div className="p-6 flex flex-col gap-4">
                    <div className="flex gap-4">
                        {Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-4 flex-1 rounded" />)}
                    </div>
                    {Array.from({ length: 5 }, (_, rowIndex) => (
                        <div key={rowIndex} className="flex gap-4">
                            {Array.from({ length: 4 }, (_, cellIndex) => <Skeleton key={cellIndex} className="h-10 flex-1 rounded" />)}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
