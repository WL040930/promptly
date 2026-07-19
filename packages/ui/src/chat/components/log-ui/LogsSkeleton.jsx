import Skeleton from '../../../components/ui/Skeleton.jsx';

export function LogsListSkeleton({ rows = 6 }) {
    return (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            {Array.from({ length: rows }, (_, index) => (
                <div key={index} className="p-4 flex items-center justify-between gap-4 border-t border-slate-100 first:border-t-0">
                    <div className="flex flex-col gap-3 min-w-0 flex-1">
                        <div className="flex items-center gap-3">
                            <Skeleton className="h-5 w-48 rounded" />
                            <Skeleton className="h-5 w-16 rounded" />
                        </div>
                        <Skeleton className="h-3 w-72 max-w-full rounded" />
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                        <Skeleton className="h-4 w-14 rounded" />
                        <Skeleton className="h-4 w-20 rounded" />
                    </div>
                </div>
            ))}
        </div>
    );
}

export function LogInspectorSkeleton() {
    return (
        <div className="flex flex-col gap-6">
            <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-200">
                <Skeleton className="h-10 rounded" />
                <Skeleton className="h-10 rounded" />
            </div>
            <Skeleton className="h-4 w-44 rounded" />
            <div className="flex flex-col gap-4">
                <Skeleton className="h-16 rounded" />
                <Skeleton className="h-16 rounded" />
                <Skeleton className="h-16 rounded" />
            </div>
            <Skeleton className="h-48 rounded" />
        </div>
    );
}

export default function LogsTabFallback() {
    return (
        <div className="tab-content flex-1 overflow-y-auto bg-slate-50/50 font-sans h-full p-6 md:p-8">
            <div className="max-w-6xl mx-auto flex flex-col gap-8">
                <div>
                    <Skeleton className="h-8 w-48 rounded" />
                    <Skeleton className="h-4 w-80 max-w-full mt-3 rounded" />
                </div>
                <div className="bg-white border border-slate-200 p-3 rounded-2xl shadow-sm">
                    <Skeleton className="h-10 w-full rounded" />
                </div>
                <LogsListSkeleton />
            </div>
        </div>
    );
}
