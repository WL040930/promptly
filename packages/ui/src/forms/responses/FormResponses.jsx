import { useEffect, useMemo, useState } from 'react';
import { useFormResponses } from '../../api/hooks/useForms.js';
import { getFormResponses } from '../../api/backend.js';
import { useToast } from '../../context/ToastContext.jsx';
import FormResponsesSkeleton from './FormResponsesSkeleton.jsx';
import PagePagination from '../../components/ui/PagePagination.jsx';

const renderValue = (val, toast) => {
    if (val === undefined || val === null || val === '') return <span className="text-gray-300">—</span>;
    if (Array.isArray(val)) return val.join(', ');
    if (typeof val === 'boolean') return val ? 'Yes' : 'No';
    if (typeof val === 'string' && val.startsWith('/api/storage/download/')) {
        const ext = val.split('.').pop().toLowerCase();
        const previewableExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'pdf', 'txt', 'csv', 'json'];
        const isPreviewable = previewableExts.includes(ext);

        const handleViewClick = (e) => {
            if (!isPreviewable) {
                e.preventDefault();
                toast.error(`The browser cannot preview .${ext} files. Only images, PDFs, and text files can be viewed directly. Please use the Download button instead.`);
            }
        };

        return (
            <div className="flex items-center gap-2">
                <a 
                    href={val} 
                    target="_blank" 
                    rel="noreferrer" 
                    onClick={handleViewClick}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${isPreviewable ? 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100' : 'bg-gray-50 text-gray-400 hover:bg-gray-100 cursor-pointer'}`}
                    title={isPreviewable ? "View file in new tab" : "Preview not available for this file type"}
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                        <circle cx="12" cy="12" r="3"></circle>
                    </svg>
                    View
                </a>
                <a 
                    href={`${val}?download=true`}
                    download
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-lg text-xs font-bold transition-colors"
                    title="Download file directly"
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
                    </svg>
                    Download
                </a>
            </div>
        );
    }
    return String(val);
};

const buildColumns = (form, responses) => {
    const seenIds = new Set();
    const columns = [];
    const allFormFieldsById = Object.fromEntries((form?.fields || []).map(f => [f.id, f]));
    (form?.fields || []).filter(f => !f.deleted && f.type !== 'heading' && f.type !== 'hidden').forEach(f => {
        seenIds.add(f.id);
        columns.push({ id: f.id, label: f.label, removed: false });
    });
    responses.forEach(response => {
        const snapshot = response.snapshot;
        if (!Array.isArray(snapshot)) return;
        snapshot.filter(f => f.type !== 'heading' && f.type !== 'hidden' && !f.deleted).forEach(f => {
            if (!seenIds.has(f.id)) {
                seenIds.add(f.id);
                columns.push({ id: f.id, label: f.label || allFormFieldsById[f.id]?.label || f.id, removed: true });
            }
        });
    });
    responses.forEach(response => {
        Object.keys(response.responseData || {}).forEach(id => {
            if (!seenIds.has(id)) {
                seenIds.add(id);
                columns.push({ id, label: allFormFieldsById[id]?.label || `Removed question (${id.slice(0, 6)})`, removed: true });
            }
        });
    });
    return columns;
};

const FormResponses = ({ form }) => {
    const [page, setPage] = useState(1);
    const pageSize = 25;
    const { data: responsePage, isLoading: loading, error } = useFormResponses(form?.id, { page, pageSize });
    const responses = responsePage?.data || [];
    const pagination = responsePage?.pagination || { page, pageSize, total: 0, totalPages: 1 };
    const toast = useToast();
    const [exportProgress, setExportProgress] = useState(null);

    useEffect(() => setPage(1), [form?.id]);

    const allColumns = useMemo(() => buildColumns(form, responses), [form, responses]);

    // Keep activeFields as a subset (used for the stat card count)
    const activeFields = useMemo(() => allColumns.filter(c => !c.removed), [allColumns]);
    const removedColumnCount = allColumns.filter(c => c.removed).length;

    const responseCount = pagination.total;
    
    // Calculate latest submission date
    let latestSubmission = '—';
    if (responses.length > 0) {
        const latestTime = responses.reduce((max, r) => {
            const t = new Date(r.createdAt).getTime();
            return t > max ? t : max;
        }, 0);
        const latestDate = new Date(latestTime);
        
        // Format nicely: Today, Yesterday, or actual date
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        
        if (latestDate.toDateString() === today.toDateString()) {
            latestSubmission = 'Today';
        } else if (latestDate.toDateString() === yesterday.toDateString()) {
            latestSubmission = 'Yesterday';
        } else {
            latestSubmission = latestDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        }
    }

    const questionCount = activeFields.length;

    const handleExportCsv = async () => {
        if (!form?.id || pagination.total === 0 || exportProgress) return;
        const exportPageSize = 100;
        const allResponses = [];
        let exportPage = 1;
        try {
            while (true) {
                const result = await getFormResponses(form.id, { page: exportPage, pageSize: exportPageSize });
                const batch = result?.data || [];
                allResponses.push(...batch);
                const total = result?.pagination?.total || allResponses.length;
                setExportProgress({ loaded: allResponses.length, total });
                if (allResponses.length >= total || batch.length === 0) break;
                exportPage += 1;
            }
            const exportColumns = buildColumns(form, allResponses);

            const headers = ['Response ID', 'Submitted At', ...exportColumns.map(col => {
                const label = col.label.replace(/"/g, '""');
                return col.removed ? `[removed] ${label}` : label;
            })];
        
        // Rows: iterate allColumns so removed-field data is included
            const rows = allResponses.map(response => {
            const submitted = new Date(response.createdAt || response.submittedAt).toLocaleString();
            
                const fieldValues = exportColumns.map(col => {
                let val = response.responseData ? response.responseData[col.id] : '';
                if (val === undefined || val === null) val = '';
                if (Array.isArray(val)) val = val.join(', ');
                if (typeof val === 'boolean') val = val ? 'Yes' : 'No';
                if (typeof val === 'string' && val.startsWith('/api/storage/download/')) {
                    val = window.location.origin + val;
                }
                const stringVal = String(val).replace(/"/g, '""');
                return `"${stringVal}"`;
            });
            
                return [`"${response.id}"`, `"${submitted}"`, ...fieldValues].join(',');
            });
        
            const csvContent = [headers.map(h => `"${h}"`).join(','), ...rows].join('\n');
        
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.setAttribute('href', url);
            link.setAttribute('download', `${form.title || 'Form_Responses'}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } catch (exportError) {
            toast.error(exportError.message || 'Could not export all responses.');
        } finally {
            setExportProgress(null);
        }
    };

    if (loading) {
        return <FormResponsesSkeleton />;
    }

    return (
        <div className="flex flex-col gap-6 animate-slide-up-fade pb-16">
            {/* Summary Stats */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-5">
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                    <div className="text-3xl font-extrabold text-gray-900 tracking-tight">{responseCount}</div>
                    <div className="text-[13px] text-gray-500 mt-1 font-bold tracking-wide uppercase">Total responses</div>
                </div>
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                    <div className="text-3xl font-extrabold text-gray-900 tracking-tight">{latestSubmission}</div>
                    <div className="text-[13px] text-gray-500 mt-1 font-bold tracking-wide uppercase">Latest Response</div>
                </div>
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                    <div className="text-3xl font-extrabold text-gray-900 tracking-tight">{questionCount}</div>
                    <div className="text-[13px] text-gray-500 mt-1 font-bold tracking-wide uppercase">Active Questions</div>
                </div>
            </div>

            {/* Loading / Error States */}
            {error ? (
                    <div className="rounded-2xl border border-red-100 bg-red-50 p-6 text-center text-red-600 shadow-sm">
                    <p className="font-bold">{error.message || 'Failed to load responses'}</p>
                </div>
            ) : responses.length > 0 ? (
                <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_12px_28px_rgba(23,24,39,0.04)]">
                    {/* Table Header */}
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 bg-gray-50/50 px-5 py-4 sm:px-6 sm:py-5">
                        <div className="flex min-w-0 flex-wrap items-center gap-3">
                            <h3 className="text-lg font-extrabold text-gray-900 tracking-tight">All Responses</h3>
                            {removedColumnCount > 0 && (
                                <span
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200"
                                    title={`${removedColumnCount} question(s) were removed from this form after some responses were already collected. Their historical data is still shown in the table.`}
                                >
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                                    </svg>
                                    {removedColumnCount} removed question{removedColumnCount > 1 ? 's' : ''}
                                </span>
                            )}
                        </div>
                        <button 
                            onClick={handleExportCsv}
                            disabled={Boolean(exportProgress)}
                            className="flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2 text-[13px] font-bold text-gray-600 shadow-sm transition-all hover:border-gray-300 hover:bg-white hover:text-gray-900"
                        >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
                            </svg>
                            {exportProgress ? `Exporting ${exportProgress.loaded}/${exportProgress.total}…` : 'Export all responses'}
                        </button>
                    </div>

                    {/* Table */}
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr>
                                    <th className="px-6 py-4 font-bold text-gray-400 text-[11px] uppercase tracking-widest border-b border-gray-100 bg-white">#</th>
                                    <th className="px-6 py-4 font-bold text-gray-400 text-[11px] uppercase tracking-widest border-b border-gray-100 bg-white whitespace-nowrap">Submitted</th>
                                    {allColumns.map((col) => (
                                        <th
                                            key={col.id}
                                            className="px-6 py-4 font-bold text-[11px] uppercase tracking-widest border-b border-gray-100 bg-white max-w-[220px]"
                                            title={col.removed ? `"${col.label}" was removed from this form` : col.label}
                                        >
                                            {col.removed ? (
                                                <span className="flex items-center gap-1.5 flex-nowrap">
                                                    <span className="line-through text-gray-300 truncate max-w-[110px] tracking-normal normal-case font-semibold">{col.label}</span>
                                                    <span className="shrink-0 px-1.5 py-0.5 rounded-full text-[9px] font-extrabold bg-amber-100 text-amber-600 border border-amber-200 normal-case tracking-normal">removed</span>
                                                </span>
                                            ) : (
                                                <span className="text-gray-400 truncate block max-w-[160px]">{col.label}</span>
                                            )}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {responses.map((response, rIdx) => (
                                    <tr key={response.id} className="border-b border-gray-50 hover:bg-gray-50/80 transition-colors group">
                                        <td className="px-6 py-4 text-gray-400 text-[13px] font-medium">{(pagination.page - 1) * pagination.pageSize + rIdx + 1}</td>
                                        <td className="px-6 py-4 text-gray-500 text-[13px] font-medium whitespace-nowrap">
                                            {new Date(response.createdAt || response.submittedAt).toLocaleString(undefined, { 
                                                year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' 
                                            })}
                                        </td>
                                        {allColumns.map((col) => {
                                            const val = response.responseData ? response.responseData[col.id] : null;
                                            return (
                                                <td
                                                    key={col.id}
                                                    className={`px-6 py-4 text-[14px] font-medium max-w-[250px] truncate ${
                                                        col.removed
                                                            ? 'text-amber-600/60 bg-amber-50/40'
                                                            : 'text-gray-800'
                                                    }`}
                                                    title={String(val ?? '')}
                                                >
                                                    {renderValue(val, toast)}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {pagination.totalPages > 1 && <div className="m-4 mt-0"><PagePagination pagination={pagination} itemLabel="responses" onPageChange={setPage} /></div>}
                </div>
            ) : (
                /* Empty State */
                <div className="flex w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-white p-12 text-center">
                    <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50">
                        <svg className="h-8 w-8 text-indigo-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                            <line x1="16" y1="13" x2="8" y2="13" />
                            <line x1="16" y1="17" x2="8" y2="17" />
                        </svg>
                    </div>
                    <h3 className="text-lg font-bold tracking-tight text-slate-900">No responses yet</h3>
                    <p className="mx-auto mt-2 max-w-sm text-sm text-slate-500">Share your form to start collecting responses. They will appear here automatically.</p>
                </div>
            )}
        </div>
    );
};

export default FormResponses;
