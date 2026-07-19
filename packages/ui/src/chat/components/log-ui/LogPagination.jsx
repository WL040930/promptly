import { ChevronLeft, ChevronRight } from 'lucide-react';

const LogPagination = ({ pagination, onPageChange }) => {
    if (!pagination || pagination.totalPages <= 1) return null;

    const { page, pageSize, total, totalPages, hasNextPage, hasPreviousPage } = pagination;
    const firstResult = (page - 1) * pageSize + 1;
    const lastResult = Math.min(page * pageSize, total);

    return (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
            <span className="text-xs font-medium text-slate-500">
                Showing {firstResult}-{lastResult} of {total} runs
            </span>
            <div className="flex items-center gap-2">
                <button
                    type="button"
                    title="Previous page"
                    aria-label="Previous page"
                    disabled={!hasPreviousPage}
                    onClick={() => onPageChange(page - 1)}
                    className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    <ChevronLeft size={16} aria-hidden="true" />
                </button>
                <span className="text-sm font-medium text-slate-700 min-w-24 text-center">
                    Page {page} of {totalPages}
                </span>
                <button
                    type="button"
                    title="Next page"
                    aria-label="Next page"
                    disabled={!hasNextPage}
                    onClick={() => onPageChange(page + 1)}
                    className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    <ChevronRight size={16} aria-hidden="true" />
                </button>
            </div>
        </div>
    );
};

export default LogPagination;
