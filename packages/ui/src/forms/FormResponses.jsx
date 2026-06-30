import React, { useMemo, useState, useEffect } from 'react';
import { getFormResponses } from '../api/backend.js';

/**
 * FormResponses — table view of form responses with summary stats.
 * Upgraded with premium design.
 */

const renderValue = (val) => {
    if (val === undefined || val === null || val === '') return <span className="text-gray-300">—</span>;
    if (Array.isArray(val)) return val.join(', ');
    if (typeof val === 'boolean') return val ? 'Yes' : 'No';
    return String(val);
};

const FormResponses = ({ form }) => {
    const [responses, setResponses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchResponses = async () => {
            if (!form || !form.id) return;
            setLoading(true);
            try {
                const data = await getFormResponses(form.id);
                setResponses(data || []);
                setError(null);
            } catch (err) {
                console.error('Failed to fetch form responses', err);
                setError('Failed to load responses');
            } finally {
                setLoading(false);
            }
        };

        fetchResponses();
    }, [form]);

    const columns = useMemo(() => {
        return form.fields
            .filter(f => f.type !== 'heading' && f.type !== 'hidden')
            .map(f => f.label);
    }, [form.fields]);

    const responseCount = responses.length;
    
    // Calculate latest submission date
    let latestSubmission = '—';
    if (responses.length > 0) {
        const latestDate = new Date(Math.max(...responses.map(r => new Date(r.submittedAt).getTime())));
        
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

    const questionCount = columns.length;

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
            {loading ? (
                <div className="flex items-center justify-center p-12 bg-white rounded-3xl shadow-sm border border-gray-100">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                </div>
            ) : error ? (
                <div className="bg-red-50 text-red-600 p-6 rounded-3xl text-center shadow-sm border border-red-100">
                    <p className="font-bold">{error}</p>
                </div>
            ) : responses.length > 0 ? (
                <div className="bg-white rounded-3xl overflow-hidden shadow-sm border border-gray-100">
                    {/* Table Header */}
                    <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 bg-gray-50/50">
                        <h3 className="text-lg font-extrabold text-gray-900 tracking-tight">All Responses</h3>
                        <button className="text-[13px] font-bold text-gray-600 hover:text-gray-900 flex items-center gap-2 px-4 py-2 rounded-xl border-2 border-gray-200 hover:border-gray-300 hover:bg-white transition-all shadow-sm">
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
                                    {columns.map((col, idx) => (
                                        <th key={idx} className="px-6 py-4 font-bold text-gray-400 text-[11px] uppercase tracking-widest border-b border-gray-100 bg-white max-w-[200px] truncate">
                                            {col}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {responses.map((response, rIdx) => (
                                    <tr key={response.id} className="border-b border-gray-50 hover:bg-gray-50/80 transition-colors group">
                                        <td className="px-6 py-4 text-gray-400 text-[13px] font-medium">{rIdx + 1}</td>
                                        <td className="px-6 py-4 text-gray-500 text-[13px] font-medium whitespace-nowrap">
                                            {new Date(response.submittedAt).toLocaleString(undefined, { 
                                                year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' 
                                            })}
                                        </td>
                                        {columns.map((col, cIdx) => (
                                            <td key={cIdx} className="px-6 py-4 text-gray-800 text-[14px] font-medium max-w-[250px] truncate">
                                                {renderValue(response.responseData ? response.responseData[col] : null)}
                                            </td>
                                        ))}
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
