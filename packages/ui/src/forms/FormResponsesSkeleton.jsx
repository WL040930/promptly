import React from 'react';
import Skeleton from '../components/ui/Skeleton.jsx';

export default function FormResponsesSkeleton() {
    return (
        <div className="flex flex-col gap-6 pb-16" aria-busy="true" aria-label="Loading responses">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                {Array.from({ length: 3 }, (_, index) => (
                    <div key={index} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col gap-3">
                        <Skeleton className="h-9 w-20 rounded" />
                        <Skeleton className="h-3 w-32 rounded" />
                    </div>
                ))}
            </div>
            <div className="bg-white rounded-3xl overflow-hidden shadow-sm border border-gray-100">
                <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 bg-gray-50/50">
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
