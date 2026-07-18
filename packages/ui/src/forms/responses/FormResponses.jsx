import React, { useMemo } from 'react';
import { useFormResponses } from '../../api/hooks/useForms.js';
import { useToast } from '../../context/ToastContext.jsx';
import FormResponsesSkeleton from './FormResponsesSkeleton.jsx';

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

const FormResponses = ({ form }) => {
    const { data: responses = [], isLoading: loading, error } = useFormResponses(form?.id);
    const toast = useToast();

    /**
     * Option A — Snapshot-aware column union.
     *
     * Columns = current active fields  UNION  any fields that appear in
     * old response snapshots (or responseData keys) but have since been
     * removed from the form.
     * Each entry: { id, label, removed: bool }
     *
     * Layer 1: snapshot array (preferred — has real labels).
     * Layer 2: responseData keys fallback when snapshot is null/sparse
     *          (handles responses submitted before snapshot was introduced,
     *           or any edge case where snapshot is missing).
     */
    const allColumns = useMemo(() => {
        // Start from current active (non-deleted) fields, preserving their order
        const seenIds = new Set();
        const columns = [];

        // Build a lookup of ALL form.fields (including soft-deleted) for label recovery
        const allFormFieldsById = Object.fromEntries((form?.fields || []).map(f => [f.id, f]));

        (form?.fields || [])
            .filter(f => !f.deleted && f.type !== 'heading' && f.type !== 'hidden')
            .forEach(f => {
                seenIds.add(f.id);
                columns.push({ id: f.id, label: f.label, removed: false });
            });

        // Layer 1: walk each response's snapshot for removed fields (best label source)
        responses.forEach(response => {
            const snapshot = response.snapshot;
            if (Array.isArray(snapshot)) {
                snapshot
                    .filter(f => f.type !== 'heading' && f.type !== 'hidden' && !f.deleted)
                    .forEach(f => {
                        if (!seenIds.has(f.id)) {
                            seenIds.add(f.id);
                            columns.push({ id: f.id, label: f.label || allFormFieldsById[f.id]?.label || f.id, removed: true });
                        }
                    });
            }
        });

        // Layer 2: scan responseData keys as fallback for responses with null snapshots.
        // Cross-reference with form.fields (soft-deleted entries still live there with deleted:true)
        // so we can recover the label.
        responses.forEach(response => {
            if (!response.responseData) return;
            Object.keys(response.responseData).forEach(id => {
                if (!seenIds.has(id)) {
                    seenIds.add(id);
                    const label = allFormFieldsById[id]?.label || `Removed question (${id.slice(0, 6)})`;
                    columns.push({ id, label, removed: true });
                }
            });
        });

        return columns;
    }, [form?.fields, responses]);

    // Keep activeFields as a subset (used for the stat card count)
    const activeFields = useMemo(() => allColumns.filter(c => !c.removed), [allColumns]);
    const removedColumnCount = allColumns.filter(c => c.removed).length;

    const responseCount = responses.length;
    
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

    const handleExportCsv = () => {
        if (!responses.length) return;

        // Headers: prefix removed columns with [removed] so analysts immediately know
        const headers = [
            'Response ID',
            'Submitted At',
            ...allColumns.map(col => {
                const label = col.label.replace(/"/g, '""');
                return col.removed ? `[removed] ${label}` : label;
            }),
        ];
        
        // Rows: iterate allColumns so removed-field data is included
        const rows = responses.map(response => {
            const submitted = new Date(response.createdAt || response.submittedAt).toLocaleString();
            
            const fieldValues = allColumns.map(col => {
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
    };

    if (loading) {
        return <FormResponsesSkeleton />;
    }

    return (
        <div className="flex flex-col gap-6 animate-slide-up-fade pb-16">
            {/* Summary Stats */}
            <div className="grid grid-cols-3 gap-5">
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
                <div className="bg-red-50 text-red-600 p-6 rounded-3xl text-center shadow-sm border border-red-100">
                    <p className="font-bold">{error.message || 'Failed to load responses'}</p>
                </div>
            ) : responses.length > 0 ? (
                <div className="bg-white rounded-3xl overflow-hidden shadow-sm border border-gray-100">
                    {/* Table Header */}
                    <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 bg-gray-50/50">
                        <div className="flex items-center gap-3">
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
                            className="text-[13px] font-bold text-gray-600 hover:text-gray-900 flex items-center gap-2 px-4 py-2 rounded-xl border-2 border-gray-200 hover:border-gray-300 hover:bg-white transition-all shadow-sm"
                        >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
                            </svg>
                            Export CSV
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
                                        <td className="px-6 py-4 text-gray-400 text-[13px] font-medium">{rIdx + 1}</td>
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
                </div>
            ) : (
                /* Empty State */
                <div className="bg-white rounded-3xl p-16 text-center shadow-sm border border-gray-100 flex flex-col items-center justify-center">
                    <div className="w-20 h-20 rounded-full bg-gray-50 flex items-center justify-center mb-6 shadow-inner border border-gray-100">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                            <line x1="16" y1="13" x2="8" y2="13" />
                            <line x1="16" y1="17" x2="8" y2="17" />
                        </svg>
                    </div>
                    <h3 className="text-xl font-extrabold text-gray-900 mb-2 tracking-tight">No responses yet</h3>
                    <p className="text-[15px] font-medium text-gray-500 max-w-sm mx-auto">Share your form to start collecting responses. They will appear here automatically.</p>
                </div>
            )}
        </div>
    );
};

export default FormResponses;
