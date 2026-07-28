const PagePagination = ({ pagination, itemLabel, onPageChange }) => {
    if (!pagination || pagination.totalPages <= 1) return null;

    const previousPage = () => onPageChange(Math.max(pagination.page - 1, 1));
    const nextPage = () => onPageChange(Math.min(pagination.page + 1, pagination.totalPages));

    return <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 shadow-sm">
        <span>{pagination.total} {itemLabel} · Page {pagination.page} of {pagination.totalPages}</span>
        <div className="flex items-center gap-2">
            <button type="button" onClick={previousPage} disabled={pagination.page <= 1} aria-label="Previous page" className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">Previous</button>
            <button type="button" onClick={nextPage} disabled={pagination.page >= pagination.totalPages} aria-label="Next page" className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">Next</button>
        </div>
    </div>;
};

export default PagePagination;
