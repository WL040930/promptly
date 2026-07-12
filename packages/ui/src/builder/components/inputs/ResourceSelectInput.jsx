import React, { useState } from 'react';
import { useForms } from '../../../api/hooks/useForms.js';
import { useMe } from '../../../api/hooks/useMe.js';

/* ─── Resource fetcher map ─────────────────────────────────────────────── */
// Add more resource types here as needed (e.g. workflows, connections).
function useResource(resource) {
    const formsQuery = useForms();
    const meQuery = useMe();

    if (resource === 'forms') {
        return {
            data: (formsQuery.data || []).map(f => ({ value: f.id, label: f.title })),
            isLoading: formsQuery.isLoading,
            isError: formsQuery.isError,
            refetch: formsQuery.refetch,
        };
    }

    if (resource === 'email-providers') {
        const data = [{ value: 'system-default', label: 'System Default (SMTP)' }];
        if (meQuery.data?.googleEmail) {
            data.push({ value: 'user-gmail', label: `User's Gmail (${meQuery.data.googleEmail})` });
        }
        return {
            data,
            isLoading: meQuery.isLoading,
            isError: meQuery.isError,
            refetch: meQuery.refetch,
        };
    }

    return { data: [], isLoading: false, isError: false, refetch: () => {} };
}

/* ─── ResourceSelectInput ─────────────────────────────────────────────── */
/**
 * A dynamic dropdown that fetches options from the API based on `resource`.
 * Currently supports: "forms"
 *
 * Props:
 *   value       — controlled string value (the selected item ID)
 *   onChange    — (newValue: string) => void
 *   resource    — which resource to fetch ("forms", etc.)
 *   placeholder — placeholder text for the empty option
 */
const inputClassName =
    'w-full bg-slate-50 border border-slate-200 rounded-lg text-slate-800 px-3 py-2 outline-none text-sm font-medium focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 transition-all shadow-inner appearance-none cursor-pointer pr-16';

const ResourceSelectInput = ({ value = '', onChange, resource, placeholder = 'Select…' }) => {
    const { data: options, isLoading, isError, refetch } = useResource(resource);
    const [refreshing, setRefreshing] = useState(false);

    const handleRefresh = async (e) => {
        e.preventDefault();
        setRefreshing(true);
        await refetch();
        setRefreshing(false);
    };

    const selectedLabel = options.find(o => o.value === value)?.label;

    return (
        <div className="flex flex-col gap-1">
            <div className="relative">
                {/* Select */}
                <select
                    value={value}
                    onChange={e => onChange?.(e.target.value)}
                    disabled={isLoading}
                    className={`${inputClassName} ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                    <option value="">{isLoading ? 'Loading…' : isError ? 'Failed to load' : placeholder}</option>
                    {options.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                </select>

                {/* Right-side icon cluster */}
                <div className="absolute inset-y-0 right-1 flex items-center">
                    {/* Refresh button */}
                    <button
                        type="button"
                        onMouseDown={handleRefresh}
                        title="Refresh list"
                        className="p-1.5 mr-0.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-200/50 rounded-md transition-colors cursor-pointer"
                    >
                        <svg
                            className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`}
                            fill="none" stroke="currentColor" strokeWidth="2"
                            strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"
                        >
                            <path d="M23 4v6h-6" />
                            <path d="M1 20v-6h6" />
                            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                        </svg>
                    </button>

                    {/* Divider */}
                    <div className="w-px h-4 bg-slate-200 mx-0.5 pointer-events-none"></div>

                    {/* Chevron icon */}
                    <div className="pointer-events-none p-1.5 text-slate-400 mr-0.5">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                            <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                    </div>
                </div>
            </div>

            {/* Show selected item ID as a subtle hint */}
            {value && (
                <p className="text-[10px] text-slate-400 font-mono truncate px-1">
                    ID: {value}
                </p>
            )}

            {isError && (
                <p className="text-[11px] text-red-500 px-1">
                    Could not load {resource}. Click ↺ to retry.
                </p>
            )}
        </div>
    );
};

export default ResourceSelectInput;
