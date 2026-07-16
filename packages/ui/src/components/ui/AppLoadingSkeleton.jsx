import React from 'react';
import Skeleton from './Skeleton.jsx';

export default function AppLoadingSkeleton() {
    return (
        <div className="app-center-page p-6">
            <div className="w-full max-w-3xl flex flex-col gap-5">
                <Skeleton className="h-8 w-48 rounded" />
                <Skeleton className="h-4 w-80 max-w-full rounded" />
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <Skeleton className="h-24 rounded-2xl" />
                    <Skeleton className="h-24 rounded-2xl" />
                    <Skeleton className="h-24 rounded-2xl" />
                </div>
                <Skeleton className="h-48 rounded-2xl" />
            </div>
        </div>
    );
}
