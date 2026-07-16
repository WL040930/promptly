import React from 'react';
import Skeleton from '../ui/Skeleton.jsx';

export default function ChatHistorySkeleton() {
    return (
        <div className="flex flex-col gap-4 py-4 w-full" aria-busy="true" aria-label="Loading chat history">
            <div className="flex w-full justify-start">
                <Skeleton className="w-8 h-8 rounded-full shrink-0 mt-4 mr-2.5" />
                <div className="flex flex-col gap-2 w-full max-w-[85%] mt-4">
                    <Skeleton className="h-2.5 w-20 rounded" />
                    <Skeleton className="h-20 w-3/4 rounded-2xl rounded-tl-none" />
                </div>
            </div>
            <div className="flex w-full justify-end">
                <div className="flex flex-col gap-2 w-full items-end max-w-[85%] mt-4">
                    <Skeleton className="h-2.5 w-12 rounded" />
                    <Skeleton className="h-12 w-2/3 rounded-2xl rounded-tr-none" />
                </div>
            </div>
        </div>
    );
}
