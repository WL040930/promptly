import Skeleton from '../ui/Skeleton.jsx';

export default function ChatSessionsSkeleton() {
    return (
        <div className="flex flex-col gap-2 px-3 pb-4" aria-busy="true" aria-label="Loading chats">
            {Array.from({ length: 5 }, (_, index) => (
                <div key={index} className="flex items-start gap-3 px-3.5 py-3 rounded-xl">
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                        <Skeleton className="h-4 w-3/4 rounded" />
                        <Skeleton className="h-3 w-1/2 rounded" />
                    </div>
                    <Skeleton className="h-5 w-5 rounded" />
                </div>
            ))}
        </div>
    );
}
