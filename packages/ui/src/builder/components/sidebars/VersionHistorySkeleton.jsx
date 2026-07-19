import Skeleton from '../../../components/ui/Skeleton.jsx';

export default function VersionHistorySkeleton() {
    return (
        <>
            {Array.from({ length: 3 }, (_, index) => (
                <div key={index} className="border border-slate-200 rounded-lg p-3 bg-white shadow-sm flex flex-col gap-3 mb-4 last:mb-0">
                    <div className="flex items-center justify-between gap-3">
                        <Skeleton className="h-4 w-24 rounded" />
                        <Skeleton className="h-3 w-24 rounded" />
                    </div>
                    <Skeleton className="h-3 w-32 rounded" />
                    <div className="flex items-center gap-2 mt-1">
                        <Skeleton className="h-8 flex-1 rounded-lg" />
                        <Skeleton className="h-8 flex-1 rounded-lg" />
                    </div>
                </div>
            ))}
        </>
    );
}
