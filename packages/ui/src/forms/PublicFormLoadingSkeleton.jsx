import React from 'react';
import Skeleton from '../components/ui/Skeleton.jsx';

export default function PublicFormLoadingSkeleton() {
    return (
        <div className="app-page min-h-screen flex items-start justify-center py-12 px-4 sm:px-6 md:py-20">
            <div className="w-full max-w-3xl flex flex-col gap-6">
                <Skeleton className="h-56 sm:h-64 w-full rounded-[2rem]" />
                <div className="bg-white rounded-[2rem] p-8 sm:p-12 shadow-sm border border-gray-100 flex flex-col gap-6">
                    <Skeleton className="h-6 w-48 rounded" />
                    <Skeleton className="h-4 w-full rounded" />
                    <Skeleton className="h-12 w-full rounded-xl" />
                    <Skeleton className="h-12 w-full rounded-xl" />
                    <Skeleton className="h-12 w-36 rounded-xl" />
                </div>
            </div>
        </div>
    );
}
